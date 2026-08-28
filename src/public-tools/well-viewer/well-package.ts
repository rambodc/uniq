import { strFromU8, unzipSync } from "fflate";
import { parseWellSurvey, type SurveyFile, type SurveyLeg } from "./survey";

export interface BitRun { id: string; bitNo: string; sizeMm: number; manufacturer: string; bitType: string; serialNo: string; depthInM: number; depthOutM: number | null }
export interface HoleSection { id: string; legId: string; startMdM: number; endMdM: number; diameterMm: number; bit: BitRun | null }
export interface CasingString { id: string; category: string; outsideDiameterMm: number; insideDiameterMm: number; topMdM: number; bottomMdM: number; grade: string }
export type OperationalChannelId = "torque" | "rotary" | "rop" | "gas" | "standpipePressure" | "differentialPressure" | "pumpOutput" | "hookLoad" | "gamma";
export interface OperationalChannel { id: OperationalChannelId; label: string; unit: string }
export interface OperationalSample { timestamp: string; holeDepthM: number; bitDepthM: number; values: Partial<Record<OperationalChannelId, number>> }
export interface OperationalStatistic { channel: OperationalChannel; count: number; minimum: number; average: number; maximum: number; latest: number }
export interface OperationalSummary { radiusM: number; sampleCount: number; firstTimestamp: string; lastTimestamp: string; ambiguousLeg: boolean; statistics: OperationalStatistic[] }
export interface WellModel extends SurveyFile { packageName: string; etsFileName: string; csvFileName: string; bitRuns: BitRun[]; holeSections: Record<string, HoleSection[]>; casings: CasingString[]; operationalChannels: OperationalChannel[]; operationalSamples: OperationalSample[] }
export class WellPackageError extends Error { constructor(message: string) { super(message); this.name = "WellPackageError"; } }

const number = (value: string | null | undefined) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const localName = (node: Node) => (node as Element).localName || node.nodeName.split(":").at(-1) || "";
const elements = (root: Node, name: string) => {
  const found: Element[] = [], visit = (node: Node) => { if (node.nodeType === 1 && localName(node) === name) found.push(node as Element); for (const child of node.childNodes ? Array.from(node.childNodes) : []) visit(child); };
  visit(root); return found;
};
const text = (element: Element, name: string) => elements(element, name)[0]?.textContent?.trim() ?? "";
const directValues = (element: Element) => Object.fromEntries(Array.from(element.childNodes).filter((child): child is Element => child.nodeType === 1).map((child) => [localName(child), child.textContent?.trim() ?? ""]));

const channelDefinitions: { id: OperationalChannelId; aliases: string[]; label: string }[] = [
  { id: "torque", aliases: ["top drive torque"], label: "Top drive torque" },
  { id: "rotary", aliases: ["top drive rotary"], label: "Rotary speed" },
  { id: "rop", aliases: ["rate of penetration", "rop"], label: "Rate of penetration" },
  { id: "gas", aliases: ["gas"], label: "Gas" },
  { id: "standpipePressure", aliases: ["standpipe pressure"], label: "Standpipe pressure" },
  { id: "differentialPressure", aliases: ["differential pressure"], label: "Differential pressure" },
  { id: "pumpOutput", aliases: ["total pump output"], label: "Total pump output" },
  { id: "hookLoad", aliases: ["hook load"], label: "Hook load" },
  { id: "gamma", aliases: ["gamma"], label: "Gamma" },
];
const csvCells = (line: string) => { const cells: string[] = []; let value = "", quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; } else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; } else value += char; } cells.push(value.trim()); return cells; };
const headerName = (value: string) => value.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
const headerUnit = (value: string) => value.match(/\(([^)]*)\)\s*$/)?.[1]?.replaceAll("_", " ") ?? "";
const usableOperationalNumber = (value: string | undefined) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > -900 ? parsed : null; };

export function parseOperationalCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new WellPackageError("The drilling CSV does not contain usable rows.");
  const headers = csvCells(lines[0]), names = headers.map(headerName);
  const find = (...aliases: string[]) => names.findIndex((name) => aliases.some((alias) => name === alias || name.endsWith(` ${alias}`)));
  const dateIndex = find("yyyy/mm/dd", "date"), timeIndex = find("hh:mm:ss", "time"), holeIndex = find("hole depth"), bitIndex = find("bit depth");
  if (holeIndex < 0 || bitIndex < 0) throw new WellPackageError("The drilling CSV is missing Hole Depth or Bit Depth.");
  const mapped = channelDefinitions.flatMap((definition) => { const index = find(...definition.aliases); return index < 0 ? [] : [{ ...definition, index, unit: headerUnit(headers[index]) }]; });
  if (!mapped.length) throw new WellPackageError("The drilling CSV does not contain supported operational channels.");
  const samples: OperationalSample[] = [];
  for (const line of lines.slice(1)) {
    const cells = csvCells(line), holeDepthM = usableOperationalNumber(cells[holeIndex]), bitDepthM = usableOperationalNumber(cells[bitIndex]);
    if (holeDepthM == null || bitDepthM == null || holeDepthM < 0 || bitDepthM < 0) continue;
    const values: OperationalSample["values"] = {};
    for (const channel of mapped) { const value = usableOperationalNumber(cells[channel.index]); if (value != null) values[channel.id] = value; }
    if (!Object.keys(values).length) continue;
    samples.push({ timestamp: [cells[dateIndex] ?? "", cells[timeIndex] ?? ""].filter(Boolean).join(" "), holeDepthM, bitDepthM, values });
  }
  if (!samples.length) throw new WellPackageError("The drilling CSV contains no usable operational samples.");
  return { channels: mapped.map(({ id, label, unit }) => ({ id, label, unit })), samples };
}

export function parseEtsXml(xml: string) {
  if (typeof DOMParser === "undefined") throw new WellPackageError("This browser cannot read ETS XML files.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (elements(document, "parsererror").length || localName(document.documentElement) !== "ETS") throw new WellPackageError("The ETS XML file is malformed.");
  const snapshots = elements(document, "Bit").flatMap((element) => {
    const values = directValues(element), size = number(values.Size), depthIn = number(values.DepthIn);
    if (!size || size <= 0 || depthIn == null || depthIn < 0) return [];
    return [{ bitNo: values.BitNo || "", sizeMm: size, manufacturer: values.Manufacturer || "", bitType: values.BitType || "", serialNo: values.SerialNo || "", depthInM: depthIn, depthOutM: number(values.DepthOut) }];
  });
  const grouped = new Map<string, BitRun>();
  for (const bit of snapshots) {
    const key = [bit.bitNo.toLowerCase(), bit.serialNo.toLowerCase(), bit.sizeMm, bit.depthInM].join("|");
    const current = grouped.get(key), deepest = Math.max(current?.depthOutM ?? -1, bit.depthOutM ?? -1);
    grouped.set(key, { ...current, ...bit, id: key, depthOutM: deepest >= bit.depthInM ? deepest : null });
  }
  const bitRuns = [...grouped.values()].sort((a, b) => a.depthInM - b.depthInM || (a.depthOutM ?? Infinity) - (b.depthOutM ?? Infinity));
  const casings = new Map<string, CasingString>(); let incompleteCasings = 0;
  for (const element of elements(document, "Casing")) {
    const values = directValues(element), od = number(values.OutsideDiameter), id = number(values.InsideDiameter), top = number(values.KBToCasingHead), bottom = number(values.KBToCasingBottom);
    if (!od || !id || top == null || bottom == null || od <= id || bottom <= top) { incompleteCasings += 1; continue; }
    const key = [values.Category, od, id, top, bottom].join("|");
    casings.set(key, { id: key, category: values.Category || "Casing", outsideDiameterMm: od, insideDiameterMm: id, topMdM: top, bottomMdM: bottom, grade: values.Grade || "" });
  }
  return { wellName: text(document.documentElement, "WellName"), uniqueWellId: text(document.documentElement, "UniqueWellId"), bitRuns, casings: [...casings.values()].sort((a, b) => a.bottomMdM - b.bottomMdM), incompleteCasings };
}

function bestBit(runs: BitRun[], leg: SurveyLeg, start: number, end: number, size: number) {
  const eligible = runs.filter((run) => run.sizeMm === size && run.depthInM <= start + 0.05 && (run.depthOutM == null || run.depthOutM >= Math.min(end, leg.endMdM) - 0.05));
  return eligible.sort((a, b) => Math.abs((a.depthOutM ?? leg.endMdM) - leg.endMdM) - Math.abs((b.depthOutM ?? leg.endMdM) - leg.endMdM))[0] ?? null;
}

export function buildHoleSections(legs: SurveyLeg[], bitRuns: BitRun[]) {
  const warnings: string[] = [], transitions = new Map<number, Set<number>>();
  for (const run of bitRuns) { const depth = Math.round(run.depthInM * 100) / 100; const sizes = transitions.get(depth) ?? new Set<number>(); sizes.add(run.sizeMm); transitions.set(depth, sizes); }
  const confirmed = [...transitions].flatMap(([depth, sizes]) => {
    if (sizes.size > 1) { warnings.push(`Conflicting bit sizes were reported at MD ${depth.toFixed(2)} m; that transition was not applied.`); return []; }
    return [{ depth, size: [...sizes][0] }];
  }).sort((a, b) => a.depth - b.depth);
  const sections: Record<string, HoleSection[]> = {};
  for (const leg of legs) {
    const inherited = confirmed.filter((item) => item.depth <= leg.startMdM).at(-1), within = confirmed.filter((item) => item.depth > leg.startMdM && item.depth < leg.endMdM);
    const rawSchedule = inherited ? [{ depth: leg.startMdM, size: inherited.size }, ...within] : within;
    const schedule = rawSchedule.filter((item, index) => index === 0 || item.size !== rawSchedule[index - 1].size);
    sections[leg.id] = schedule.map((item, index) => {
      const end = schedule[index + 1]?.depth ?? leg.endMdM;
      return { id: `${leg.id}-${item.depth}-${item.size}`, legId: leg.id, startMdM: item.depth, endMdM: end, diameterMm: item.size, bit: bestBit(bitRuns, leg, item.depth, end, item.size) };
    }).filter((item) => item.endMdM > item.startMdM);
    if (!sections[leg.id].length) warnings.push(`No confirmed bit-size interval could be assigned to ${leg.name}.`);
  }
  return { sections, warnings };
}

function compatibleNames(survey: string, ets: string) {
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []), a = words(survey), b = words(ets);
  if (!a.size || !b.size) return true;
  return [...a].filter((word) => word.length > 1 && b.has(word)).length >= Math.min(3, a.size);
}

export function parseWellPackage(bytes: Uint8Array, packageName: string): WellModel {
  const files = unzipSync(bytes, { filter: (file) => file.originalSize <= 15_000_000 && (/surveys_[^/]*\.txt$/i.test(file.name) || /(?:^|\/)ETS[^/]*\.xml$/i.test(file.name) || /(?:^|\/)[^/]+\.csv$/i.test(file.name)) });
  const names = Object.keys(files), surveys = names.filter((name) => /surveys_[^/]*\.txt$/i.test(name)), xmlFiles = names.filter((name) => /(?:^|\/)ETS[^/]*\.xml$/i.test(name)), csvFiles = names.filter((name) => /(?:^|\/)[^/]+\.csv$/i.test(name));
  if (surveys.length !== 1) throw new WellPackageError(surveys.length ? "This package contains multiple survey TXT files. Import a package for one well." : "This package does not contain a surveys_*.txt file.");
  if (xmlFiles.length !== 1) throw new WellPackageError(xmlFiles.length ? "This package contains multiple ETS XML files. Import a package for one well." : "This package does not contain an ETS XML file.");
  if (csvFiles.length !== 1) throw new WellPackageError(csvFiles.length ? "This package contains multiple drilling CSV files. Import a package for one well." : "This package does not contain a drilling CSV file.");
  const survey = parseWellSurvey(strFromU8(files[surveys[0]]), surveys[0]), ets = parseEtsXml(strFromU8(files[xmlFiles[0]])), operations = parseOperationalCsv(strFromU8(files[csvFiles[0]]));
  if (!ets.bitRuns.length) throw new WellPackageError("The ETS XML does not contain usable bit-size and depth records.");
  if (!compatibleNames(survey.name, ets.wellName)) throw new WellPackageError("The survey TXT and ETS XML appear to describe different wells.");
  const maximumSurveyMd = Math.max(...survey.legs.map((leg) => leg.endMdM)), maximumBitMd = Math.max(...ets.bitRuns.map((run) => run.depthOutM ?? run.depthInM));
  if (Math.abs(maximumSurveyMd - maximumBitMd) > Math.max(100, maximumSurveyMd * 0.1)) throw new WellPackageError("The survey and ETS depth ranges do not match closely enough to combine safely.");
  const built = buildHoleSections(survey.legs, ets.bitRuns), warnings = [...survey.warnings, ...built.warnings];
  if (ets.incompleteCasings) warnings.push(`${ets.incompleteCasings} incomplete casing ${ets.incompleteCasings === 1 ? "record was" : "records were"} ignored.`);
  return { ...survey, name: ets.wellName || survey.name, packageName, etsFileName: xmlFiles[0], csvFileName: csvFiles[0], bitRuns: ets.bitRuns, holeSections: built.sections, casings: ets.casings, operationalChannels: operations.channels, operationalSamples: operations.samples, warnings };
}

export const holeAtMd = (well: WellModel, legId: string, mdM: number) => { const sections = well.holeSections[legId] ?? []; return sections.find((section, index) => mdM >= section.startMdM && (mdM < section.endMdM || index === sections.length - 1)) ?? null; };
export const casingsAtMd = (well: WellModel, mdM: number) => well.casings.filter((casing) => mdM >= casing.topMdM && mdM <= casing.bottomMdM);
export function summarizeOperations(well: WellModel, mdM: number, radiusM = 2): OperationalSummary | null {
  const nearby = well.operationalSamples.filter((sample) => Math.abs(sample.bitDepthM - mdM) <= radiusM);
  if (!nearby.length) return null;
  const statistics = well.operationalChannels.flatMap((channel) => { const values = nearby.flatMap((sample) => sample.values[channel.id] == null ? [] : [sample.values[channel.id]!]); if (!values.length) return []; return [{ channel, count: values.length, minimum: Math.min(...values), average: values.reduce((sum, value) => sum + value, 0) / values.length, maximum: Math.max(...values), latest: values.at(-1)! }]; });
  return { radiusM, sampleCount: nearby.length, firstTimestamp: nearby[0].timestamp, lastTimestamp: nearby.at(-1)!.timestamp, ambiguousLeg: well.legs.filter((leg) => mdM >= leg.startMdM && mdM <= leg.endMdM).length > 1, statistics };
}
