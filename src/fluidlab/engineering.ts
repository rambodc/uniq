export type UnitSystem = "metric" | "imperial";
export type AzimuthReference = "true" | "grid" | "magnetic";
export type HoleSectionCategory = "surface" | "intermediate" | "main";
export interface SurveyStation {
  id: string;
  mdM: number;
  inclinationDeg: number;
  azimuthDeg: number;
}
export interface HoleSection {
  id: string;
  category: HoleSectionCategory;
  name: string;
  endStationId: string;
  diameterMm: number;
  color: string;
  visible: boolean;
}
export interface DisplaySettings {
  selectedSectionId: string | null;
  selectedStationId: string | null;
  labels: boolean;
}
export interface WellProject {
  version: 1;
  name: string;
  classification: string;
  unitSystem: UnitSystem;
  azimuthReference: AzimuthReference;
  holeSections: HoleSection[];
  surveyStations: SurveyStation[];
  display: DisplaySettings;
}
export interface CalculatedStation extends SurveyStation {
  tvdM: number;
  northingM: number;
  eastingM: number;
  verticalSectionM: number;
  deltaMdM: number;
  doglegDeg: number;
  dlsDegPer30m: number;
  buildDegPer30m: number;
  turnDegPer30m: number;
  sectionId: string | null;
}
export interface DerivedSection {
  sectionId: string;
  startMdM: number;
  endMdM: number;
  startTvdM: number;
  endTvdM: number;
  capacityM3: number;
  stations: CalculatedStation[];
}
export interface GeneratedProject {
  stations: CalculatedStation[];
  sections: DerivedSection[];
  errors: string[];
  totalCapacityM3: number;
}
const colors = ["#35dfbd", "#43aee8", "#8a73e8", "#f2b84b", "#ef7d65"],
  uid = (p: string) =>
    `${p}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
  rad = (v: number) => (v * Math.PI) / 180,
  deg = (v: number) => (v * 180) / Math.PI;
export const shortestAzimuthDelta = (a: number, b: number) =>
  ((b - a + 540) % 360) - 180;
const makeStation = (
  mdM: number,
  inclinationDeg = 0,
  azimuthDeg = 0,
): SurveyStation => ({ id: uid("station"), mdM, inclinationDeg, azimuthDeg });
export function createProject(unitSystem: UnitSystem = "metric"): WellProject {
  const origin = makeStation(0),
    surface = makeStation(500),
    main = makeStation(2000),
    s: HoleSection = {
      id: uid("section"),
      category: "surface",
      name: "Surface",
      endStationId: surface.id,
      diameterMm: 444.5,
      color: colors[0],
      visible: true,
    },
    m: HoleSection = {
      id: uid("section"),
      category: "main",
      name: "Main Hole",
      endStationId: main.id,
      diameterMm: 215.9,
      color: colors[2],
      visible: true,
    };
  return {
    version: 1,
    name: "New planned well",
    classification: "Planned directional well",
    unitSystem,
    azimuthReference: "true",
    holeSections: [s, m],
    surveyStations: [origin, surface, main],
    display: {
      selectedSectionId: s.id,
      selectedStationId: surface.id,
      labels: true,
    },
  };
}
export const sectionEndMd = (p: WellProject, s: HoleSection) =>
  p.surveyStations.find((x) => x.id === s.endStationId)?.mdM ?? NaN;
export const sectionStartMd = (p: WellProject, i: number) =>
  i ? sectionEndMd(p, p.holeSections[i - 1]) : 0;
export const sectionAtMd = (p: WellProject, md: number) =>
  p.holeSections.find(
    (s, i) =>
      md > sectionStartMd(p, i) - 1e-9 && md <= sectionEndMd(p, s) + 1e-9,
  ) ?? null;
export const isBoundaryStation = (p: WellProject, id: string) =>
  p.holeSections.some((s) => s.endStationId === id);
export function addIntermediateSection(p: WellProject) {
  const mi = p.holeSections.findIndex((s) => s.category === "main"),
    before = p.holeSections[mi - 1],
    main = p.holeSections[mi],
    start = sectionEndMd(p, before),
    end = sectionEndMd(p, main),
    md = (start + end) / 2,
    prior = [...p.surveyStations].filter((s) => s.mdM <= md).at(-1)!,
    boundary = makeStation(md, prior.inclinationDeg, prior.azimuthDeg),
    count =
      p.holeSections.filter((s) => s.category === "intermediate").length + 1,
    section: HoleSection = {
      id: uid("section"),
      category: "intermediate",
      name: `Intermediate ${count}`,
      endStationId: boundary.id,
      diameterMm: before.diameterMm,
      color: colors[mi % colors.length],
      visible: true,
    };
  p.surveyStations.push(boundary);
  p.surveyStations.sort((a, b) => a.mdM - b.mdM);
  p.holeSections.splice(mi, 0, section);
  return section.id;
}
export function deleteIntermediateSection(p: WellProject, id: string) {
  const i = p.holeSections.findIndex(
    (s) => s.id === id && s.category === "intermediate",
  );
  if (i < 0) return false;
  const [s] = p.holeSections.splice(i, 1);
  p.surveyStations = p.surveyStations.filter((x) => x.id !== s.endStationId);
  return true;
}
export function insertSurveyStation(p: WellProject, afterId: string) {
  const rows = [...p.surveyStations].sort((a, b) => a.mdM - b.mdM),
    i = rows.findIndex((s) => s.id === afterId),
    next = rows[i + 1];
  if (i < 0 || !next) return null;
  const prior = rows[i],
    s = makeStation(
      (prior.mdM + next.mdM) / 2,
      prior.inclinationDeg,
      prior.azimuthDeg,
    );
  p.surveyStations.push(s);
  p.surveyStations.sort((a, b) => a.mdM - b.mdM);
  return s.id;
}
export function validateProject(p: WellProject): string[] {
  const e: string[] = [];
  if (
    !p ||
    p.version !== 1 ||
    "openHoleSections" in (p as unknown as Record<string, unknown>)
  )
    return ["Unsupported FluidLab project schema."];
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 100)
    e.push("Enter a valid project name.");
  if (!["metric", "imperial"].includes(p.unitSystem))
    e.push("Choose project units.");
  if (!["true", "grid", "magnetic"].includes(p.azimuthReference))
    e.push("Choose an azimuth reference.");
  if (!Array.isArray(p.holeSections) || p.holeSections.length < 2)
    e.push("Add Surface and Main Hole sections.");
  if (!Array.isArray(p.surveyStations) || p.surveyStations.length < 3)
    e.push("Add the required survey stations.");
  const sections = p.holeSections ?? [],
    stations = p.surveyStations ?? [],
    ids = new Set<string>();
  if (sections[0]?.category !== "surface") e.push("Surface must be first.");
  if (sections.at(-1)?.category !== "main") e.push("Main Hole must be final.");
  if (sections.slice(1, -1).some((s) => s.category !== "intermediate"))
    e.push("Only Intermediate sections may be between Surface and Main Hole.");
  stations.forEach((s, i) => {
    if (!s || typeof s.id !== "string" || ids.has(s.id))
      e.push("Survey station IDs must be unique.");
    else ids.add(s.id);
    if (!Number.isFinite(s.mdM) || s.mdM < 0)
      e.push(`Station ${i + 1}: MD must be zero or greater.`);
    if (
      !Number.isFinite(s.inclinationDeg) ||
      s.inclinationDeg < 0 ||
      s.inclinationDeg > 180
    )
      e.push(`Station ${i + 1}: inclination must be 0–180°.`);
    if (
      !Number.isFinite(s.azimuthDeg) ||
      s.azimuthDeg < 0 ||
      s.azimuthDeg >= 360
    )
      e.push(`Station ${i + 1}: azimuth must be 0–<360°.`);
    if (i && s.mdM <= stations[i - 1].mdM)
      e.push("Survey-station MDs must increase without duplicates.");
  });
  const origin = stations[0];
  if (
    !origin ||
    origin.mdM !== 0 ||
    origin.inclinationDeg !== 0 ||
    origin.azimuthDeg !== 0
  )
    e.push(
      "The surface-origin station must remain MD 0, inclination 0°, azimuth 0°.",
    );
  let prior = 0;
  sections.forEach((s, i) => {
    const name = s.name || `Section ${i + 1}`,
      end = stations.find((x) => x.id === s.endStationId)?.mdM;
    if (typeof s.name !== "string" || !s.name.trim())
      e.push(`Section ${i + 1} needs a name.`);
    if (!Number.isFinite(s.diameterMm) || s.diameterMm <= 0)
      e.push(`${name}: enter a positive hole diameter.`);
    if (!Number.isFinite(end)) e.push(`${name}: boundary station is missing.`);
    else if (end! <= prior)
      e.push(`${name}: end MD must be deeper than ${prior}.`);
    if (Number.isFinite(end)) prior = end!;
  });
  if (
    stations.length &&
    Number.isFinite(prior) &&
    stations.at(-1)!.mdM !== prior
  )
    e.push("No survey station may extend beyond total depth.");
  return [...new Set(e)];
}
function next(
  prev: CalculatedStation,
  s: SurveyStation,
  sectionId: string | null,
): CalculatedStation {
  const d = s.mdM - prev.mdM,
    i1 = rad(prev.inclinationDeg),
    i2 = rad(s.inclinationDeg),
    a1 = rad(prev.azimuthDeg),
    a2 = rad(s.azimuthDeg),
    dl = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          Math.cos(i1) * Math.cos(i2) +
            Math.sin(i1) * Math.sin(i2) * Math.cos(a2 - a1),
        ),
      ),
    ),
    rf = dl < 1e-7 ? 1 + (dl * dl) / 12 : (2 * Math.tan(dl / 2)) / dl,
    dn =
      (d / 2) *
      (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) *
      rf,
    de =
      (d / 2) *
      (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) *
      rf,
    dt = (d / 2) * (Math.cos(i1) + Math.cos(i2)) * rf,
    turn = shortestAzimuthDelta(prev.azimuthDeg, s.azimuthDeg);
  return {
    ...s,
    tvdM: prev.tvdM + dt,
    northingM: prev.northingM + dn,
    eastingM: prev.eastingM + de,
    verticalSectionM: Math.hypot(prev.northingM + dn, prev.eastingM + de),
    deltaMdM: d,
    doglegDeg: deg(dl),
    dlsDegPer30m: d ? (deg(dl) / d) * 30 : 0,
    buildDegPer30m: d ? ((s.inclinationDeg - prev.inclinationDeg) / d) * 30 : 0,
    turnDegPer30m: d ? (turn / d) * 30 : 0,
    sectionId,
  };
}
export function generateProject(p: WellProject): GeneratedProject {
  const errors = validateProject(p),
    input = p.surveyStations ?? [];
  if (!input.length)
    return { stations: [], sections: [], errors, totalCapacityM3: 0 };
  const first: CalculatedStation = {
      ...input[0],
      tvdM: 0,
      northingM: 0,
      eastingM: 0,
      verticalSectionM: 0,
      deltaMdM: 0,
      doglegDeg: 0,
      dlsDegPer30m: 0,
      buildDegPer30m: 0,
      turnDegPer30m: 0,
      sectionId: p.holeSections?.[0]?.id ?? null,
    },
    stations = [first];
  for (let i = 1; i < input.length; i++)
    stations.push(
      next(stations[i - 1], input[i], sectionAtMd(p, input[i].mdM)?.id ?? null),
    );
  let totalCapacityM3 = 0;
  const sections = (p.holeSections ?? []).map((s, i) => {
    const startMdM = sectionStartMd(p, i),
      endMdM = sectionEndMd(p, s),
      start = stations.find((x) => Math.abs(x.mdM - startMdM) < 1e-8),
      end = stations.find((x) => x.id === s.endStationId),
      capacityM3 =
        ((Math.PI * (s.diameterMm / 1000) ** 2) / 4) * (endMdM - startMdM);
    if (Number.isFinite(capacityM3)) totalCapacityM3 += capacityM3;
    return {
      sectionId: s.id,
      startMdM,
      endMdM,
      startTvdM: start?.tvdM ?? 0,
      endTvdM: end?.tvdM ?? 0,
      capacityM3,
      stations: stations.filter((x) => x.mdM >= startMdM && x.mdM <= endMdM),
    };
  });
  return { stations, sections, errors, totalCapacityM3 };
}
export function parseProjectJson(text: string) {
  if (new TextEncoder().encode(text).length > 1024 * 1024) return null;
  try {
    const value = JSON.parse(text) as WellProject;
    return validateProject(value).length ? null : value;
  } catch {
    return null;
  }
}
export const projectFileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "well"
  }.fluidlab.json`;
export const cubicMetresToBbl = (v: number) => v * 6.28981077;
