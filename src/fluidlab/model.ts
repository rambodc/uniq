export type UnitSystem = "metric" | "imperial";
export type WellType = "vertical" | "directional" | "horizontal" | "multilateral";
export interface MainTrajectory {
  surfaceNorthing: number; surfaceEasting: number; verticalSection: number; kickoffMd: number;
  buildRate: number; targetInclination: number; azimuth: number; holdLength: number; lateralLength: number;
}
export interface HoleSection { id: string; name: string; diameterMm: number; startMd: number; endMd: number; color: string; visible: boolean }
export interface LateralBranch { id: string; name: string; tieInMd: number; buildRate: number; targetInclination: number; azimuth: number; lateralLength: number; color: string; visible: boolean }
export interface DisplaySettings { formations: boolean; labels: boolean; dimensions: boolean; isolated: "all" | "main" | string; cameraDrift: boolean }
export interface WellDesign { version: 1; name: string; type: WellType; units: UnitSystem; main: MainTrajectory; sections: HoleSection[]; branches: LateralBranch[]; display: DisplaySettings }
export interface TrajectoryStation { md: number; inclination: number; azimuth: number; tvd: number; northing: number; easting: number; kind?: string; label?: string }
export interface WellSummary { totalMd: number; tvd: number; horizontalDisplacement: number; kickoffMd: number; endBuildMd: number; endBuildTvd: number; finalInclination: number; finalAzimuth: number; lateralReach: number; bottomNorthing: number; bottomEasting: number }
export interface GeneratedWell { main: TrajectoryStation[]; branches: Record<string, TrajectoryStation[]>; summary: WellSummary; errors: string[] }

const sectionColors = ["#39dcb9", "#43aee8", "#866ee8"];
const baseSections = (total: number): HoleSection[] => [
  { id: "surface", name: "Surface hole", diameterMm: 444.5, startMd: 0, endMd: Math.min(500, total), color: sectionColors[0], visible: true },
  { id: "intermediate", name: "Intermediate hole", diameterMm: 311.2, startMd: Math.min(500, total), endMd: Math.min(1800, total), color: sectionColors[1], visible: true },
  { id: "production", name: "Main hole", diameterMm: 215.9, startMd: Math.min(1800, total), endMd: total, color: sectionColors[2], visible: true },
];
const defaults: Record<WellType, Omit<WellDesign, "sections">> = {
  vertical: { version: 1, name: "Vertical production well", type: "vertical", units: "metric", main: { surfaceNorthing: 0, surfaceEasting: 0, verticalSection: 3000, kickoffMd: 3000, buildRate: 3, targetInclination: 0, azimuth: 90, holdLength: 0, lateralLength: 0 }, branches: [], display: { formations: true, labels: true, dimensions: true, isolated: "all", cameraDrift: true } },
  directional: { version: 1, name: "Directional hold well", type: "directional", units: "metric", main: { surfaceNorthing: 0, surfaceEasting: 0, verticalSection: 3800, kickoffMd: 1600, buildRate: 3, targetInclination: 55, azimuth: 70, holdLength: 1800, lateralLength: 0 }, branches: [], display: { formations: true, labels: true, dimensions: true, isolated: "all", cameraDrift: true } },
  horizontal: { version: 1, name: "Single horizontal well", type: "horizontal", units: "metric", main: { surfaceNorthing: 0, surfaceEasting: 0, verticalSection: 4200, kickoffMd: 1850, buildRate: 5, targetInclination: 90, azimuth: 90, holdLength: 0, lateralLength: 2200 }, branches: [], display: { formations: true, labels: true, dimensions: true, isolated: "all", cameraDrift: true } },
  multilateral: { version: 1, name: "Three-branch multilateral", type: "multilateral", units: "metric", main: { surfaceNorthing: 0, surfaceEasting: 0, verticalSection: 4300, kickoffMd: 1750, buildRate: 5, targetInclination: 90, azimuth: 90, holdLength: 0, lateralLength: 2400 }, branches: [
    { id: "branch-a", name: "North lateral", tieInMd: 2650, buildRate: 4, targetInclination: 88, azimuth: 55, lateralLength: 1200, color: "#f2b84b", visible: true },
    { id: "branch-b", name: "Central lateral", tieInMd: 3150, buildRate: 4, targetInclination: 90, azimuth: 90, lateralLength: 1450, color: "#ef7d65", visible: true },
    { id: "branch-c", name: "South lateral", tieInMd: 3650, buildRate: 4, targetInclination: 87, azimuth: 125, lateralLength: 1100, color: "#d66fe0", visible: true },
  ], display: { formations: true, labels: true, dimensions: true, isolated: "all", cameraDrift: true } },
};

export function createPreset(type: WellType): WellDesign {
  const base = structuredClone(defaults[type]);
  const buildLength = type === "vertical" ? 0 : (base.main.targetInclination / base.main.buildRate) * 30;
  const total = type === "vertical" ? base.main.verticalSection : base.main.kickoffMd + buildLength + base.main.holdLength + base.main.lateralLength;
  return { ...base, sections: baseSections(Math.round(total)) };
}
export const presets = { vertical: createPreset("vertical"), directional: createPreset("directional"), horizontal: createPreset("horizontal"), multilateral: createPreset("multilateral") };

const rad = (degrees: number) => degrees * Math.PI / 180;
export const metresToFeet = (value: number) => value * 3.280839895;
export const feetToMetres = (value: number) => value / 3.280839895;
export const mmToInches = (value: number) => value / 25.4;
export const inchesToMm = (value: number) => value * 25.4;

function minimumCurvature(previous: TrajectoryStation, md: number, inclination: number, azimuth: number): TrajectoryStation {
  const deltaMd = md - previous.md, i1 = rad(previous.inclination), i2 = rad(inclination), a1 = rad(previous.azimuth), a2 = rad(azimuth);
  const dogleg = Math.acos(Math.max(-1, Math.min(1, Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1)))));
  const ratio = dogleg < 1e-8 ? 1 : (2 / dogleg) * Math.tan(dogleg / 2);
  return { md, inclination, azimuth, tvd: previous.tvd + deltaMd / 2 * (Math.cos(i1) + Math.cos(i2)) * ratio, northing: previous.northing + deltaMd / 2 * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * ratio, easting: previous.easting + deltaMd / 2 * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * ratio };
}
function appendSegment(stations: TrajectoryStation[], length: number, targetInclination: number, targetAzimuth: number, step = 30, kind?: string) {
  if (length <= 0) return;
  const start = stations.at(-1)!, startMd = start.md, startInclination = start.inclination, startAzimuth = start.azimuth;
  const count = Math.max(1, Math.ceil(length / step));
  for (let index = 1; index <= count; index++) {
    const progress = index / count, md = startMd + length * progress;
    stations.push({ ...minimumCurvature(stations.at(-1)!, md, startInclination + (targetInclination - startInclination) * progress, startAzimuth + (targetAzimuth - startAzimuth) * progress), kind });
  }
}
export function interpolateStation(stations: TrajectoryStation[], md: number): TrajectoryStation {
  if (md <= stations[0].md) return { ...stations[0], md };
  if (md >= stations.at(-1)!.md) return { ...stations.at(-1)! };
  const upperIndex = stations.findIndex((station) => station.md >= md), lower = stations[upperIndex - 1], upper = stations[upperIndex];
  const t = (md - lower.md) / (upper.md - lower.md);
  return { md, inclination: lower.inclination + (upper.inclination - lower.inclination) * t, azimuth: lower.azimuth + (upper.azimuth - lower.azimuth) * t, tvd: lower.tvd + (upper.tvd - lower.tvd) * t, northing: lower.northing + (upper.northing - lower.northing) * t, easting: lower.easting + (upper.easting - lower.easting) * t };
}
export function validateDesign(design: WellDesign): string[] {
  const errors: string[] = [], m = design.main;
  if (!design.name.trim()) errors.push("Well name is required.");
  if (m.verticalSection <= 0 || m.kickoffMd < 0 || m.holdLength < 0 || m.lateralLength < 0) errors.push("Depths and lengths must be non-negative.");
  if (design.type !== "vertical" && (m.buildRate <= 0 || m.buildRate > 20)) errors.push("Build rate must be greater than 0 and no more than 20°/30 m.");
  if (m.azimuth < 0 || m.azimuth >= 360) errors.push("Azimuth must be between 0° and 359.99°.");
  if (design.type === "directional" && (m.targetInclination <= 0 || m.targetInclination >= 90)) errors.push("Directional inclination must be between 1° and 89°.");
  if ((design.type === "horizontal" || design.type === "multilateral") && m.targetInclination !== 90) errors.push("Horizontal and multilateral main wells must target 90°.");
  if (design.sections.length < 1 || design.sections.length > 3) errors.push("Use between one and three hole sections.");
  design.sections.forEach((section, index) => {
    if (section.diameterMm <= 0 || section.startMd < 0 || section.endMd <= section.startMd) errors.push(`${section.name}: enter a positive diameter and valid MD range.`);
    if (index > 0 && section.startMd < design.sections[index - 1].endMd) errors.push(`${section.name}: hole sections cannot overlap.`);
  });
  if (design.branches.length > 3) errors.push("A maximum of three branches is supported.");
  design.branches.forEach((branch) => {
    if (branch.buildRate <= 0 || branch.buildRate > 20 || branch.lateralLength <= 0) errors.push(`${branch.name}: enter a valid build rate and lateral length.`);
    if (branch.targetInclination < 0 || branch.targetInclination > 90 || branch.azimuth < 0 || branch.azimuth >= 360) errors.push(`${branch.name}: inclination or azimuth is outside its supported range.`);
  });
  return errors;
}
export function generateWell(design: WellDesign): GeneratedWell {
  const errors = validateDesign(design), m = design.main;
  const first: TrajectoryStation = { md: 0, inclination: 0, azimuth: m.azimuth, tvd: 0, northing: m.surfaceNorthing, easting: m.surfaceEasting, kind: "surface", label: "Surface" };
  const main = [first];
  if (design.type === "vertical") appendSegment(main, m.verticalSection, 0, m.azimuth, 50, "vertical");
  else {
    appendSegment(main, m.kickoffMd, 0, m.azimuth, 50, "vertical");
    main.at(-1)!.kind = "kop"; main.at(-1)!.label = "KOP";
    const buildLength = (m.targetInclination / m.buildRate) * 30;
    appendSegment(main, buildLength, m.targetInclination, m.azimuth, 20, "build");
    main.at(-1)!.kind = "eob"; main.at(-1)!.label = "End build";
    appendSegment(main, m.holdLength, m.targetInclination, m.azimuth, 50, "hold");
    appendSegment(main, m.lateralLength, m.targetInclination, m.azimuth, 50, "lateral");
  }
  main.at(-1)!.kind = "bottom"; main.at(-1)!.label = "Bottomhole";
  const totalMd = main.at(-1)!.md;
  const finalSection = design.sections.at(-1);
  if (finalSection && finalSection.endMd > totalMd + .1) errors.push("Hole sections must end within the main well MD.");
  const branches: Record<string, TrajectoryStation[]> = {};
  if (design.type === "multilateral") design.branches.forEach((branch) => {
    if (branch.tieInMd <= 0 || branch.tieInMd >= totalMd) { errors.push(`${branch.name}: tie-in MD must lie within the main well.`); return; }
    const tie = { ...interpolateStation(main, branch.tieInMd), md: branch.tieInMd, kind: "tie-in", label: branch.name };
    const points = [tie], buildLength = Math.abs(branch.targetInclination - tie.inclination) / branch.buildRate * 30;
    appendSegment(points, buildLength, branch.targetInclination, branch.azimuth, 20, "branch-build");
    appendSegment(points, branch.lateralLength, branch.targetInclination, branch.azimuth, 40, "branch-lateral");
    points.at(-1)!.kind = "branch-bottom"; points.at(-1)!.label = `${branch.name} target`;
    branches[branch.id] = points;
  });
  const bottom = main.at(-1)!, eob = main.find((station) => station.kind === "eob") ?? bottom;
  const summary = { totalMd, tvd: bottom.tvd, horizontalDisplacement: Math.hypot(bottom.northing - m.surfaceNorthing, bottom.easting - m.surfaceEasting), kickoffMd: design.type === "vertical" ? 0 : m.kickoffMd, endBuildMd: eob.md, endBuildTvd: eob.tvd, finalInclination: bottom.inclination, finalAzimuth: bottom.azimuth, lateralReach: m.lateralLength, bottomNorthing: bottom.northing, bottomEasting: bottom.easting };
  return { main, branches, summary, errors };
}
export function sectionStations(stations: TrajectoryStation[], section: HoleSection): TrajectoryStation[] {
  const inside = stations.filter((station) => station.md > section.startMd && station.md < section.endMd);
  return [interpolateStation(stations, section.startMd), ...inside, interpolateStation(stations, Math.min(section.endMd, stations.at(-1)!.md))];
}
export function displayDistance(valueMetres: number, units: UnitSystem) { return units === "metric" ? `${Math.round(valueMetres).toLocaleString()} m` : `${Math.round(metresToFeet(valueMetres)).toLocaleString()} ft`; }
export function displayDiameter(valueMm: number, units: UnitSystem) { return units === "metric" ? `${valueMm.toFixed(1)} mm` : `${mmToInches(valueMm).toFixed(3)} in`; }

export function serializeDesign(design: WellDesign) {
  const bytes = new TextEncoder().encode(JSON.stringify(design));
  let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function parseDesign(payload: string): WellDesign | null {
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payload.length % 4) % 4);
    const binary = atob(padded), bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as WellDesign;
    if (parsed.version !== 1 || !["vertical", "directional", "horizontal", "multilateral"].includes(parsed.type) || !parsed.main || !parsed.display || !Array.isArray(parsed.sections) || !Array.isArray(parsed.branches)) return null;
    if (generateWell(parsed).errors.length) return null;
    return parsed;
  } catch { return null; }
}
export function consultationMailto(design: WellDesign, summary: WellSummary, shareUrl: string) {
  const lines = ["Hello UniqEnergy team,", "", `I created a 3D wellbore design: ${design.name}`, `Architecture: ${design.type}`, `Total MD: ${displayDistance(summary.totalMd, design.units)}`, `TVD: ${displayDistance(summary.tvd, design.units)}`, `Horizontal displacement: ${displayDistance(summary.horizontalDisplacement, design.units)}`, `KOP: ${displayDistance(summary.kickoffMd, design.units)}`, `Final inclination / azimuth: ${summary.finalInclination.toFixed(1)}° / ${summary.finalAzimuth.toFixed(1)}°`, "", "Hole sections:", ...design.sections.map((section) => `- ${section.name}: ${displayDiameter(section.diameterMm, design.units)}, ${displayDistance(section.startMd, design.units)}–${displayDistance(section.endMd, design.units)} MD`), "", `Shared design: ${shareUrl}`, "", "I understand this is a planning visualization and not a directional survey record."];
  return `mailto:info@uniqenergy.com?subject=${encodeURIComponent("3D wellbore design consultation")}&body=${encodeURIComponent(lines.join("\n"))}`;
}
