import { strFromU8, unzipSync } from "fflate";
import { parsePasonSurvey, type SurveyFile, type SurveyLeg } from "./survey";

export interface BitRun { id: string; bitNo: string; sizeMm: number; manufacturer: string; bitType: string; serialNo: string; depthInM: number; depthOutM: number | null }
export interface HoleSection { id: string; legId: string; startMdM: number; endMdM: number; diameterMm: number; bit: BitRun | null }
export interface CasingString { id: string; category: string; outsideDiameterMm: number; insideDiameterMm: number; topMdM: number; bottomMdM: number; grade: string }
export interface PasonWell extends SurveyFile { packageName: string; etsFileName: string; bitRuns: BitRun[]; holeSections: Record<string, HoleSection[]>; casings: CasingString[] }
export class PasonPackageError extends Error { constructor(message: string) { super(message); this.name = "PasonPackageError"; } }

const number = (value: string | null | undefined) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const localName = (node: Node) => (node as Element).localName || node.nodeName.split(":").at(-1) || "";
const elements = (root: Node, name: string) => {
  const found: Element[] = [], visit = (node: Node) => { if (node.nodeType === 1 && localName(node) === name) found.push(node as Element); for (const child of node.childNodes ? Array.from(node.childNodes) : []) visit(child); };
  visit(root); return found;
};
const text = (element: Element, name: string) => elements(element, name)[0]?.textContent?.trim() ?? "";
const directValues = (element: Element) => Object.fromEntries(Array.from(element.childNodes).filter((child): child is Element => child.nodeType === 1).map((child) => [localName(child), child.textContent?.trim() ?? ""]));

export function parseEtsXml(xml: string) {
  if (typeof DOMParser === "undefined") throw new PasonPackageError("This browser cannot read ETS XML files.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (elements(document, "parsererror").length || localName(document.documentElement) !== "ETS") throw new PasonPackageError("The ETS XML file is malformed.");
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

export function parsePasonPackage(bytes: Uint8Array, packageName: string): PasonWell {
  const files = unzipSync(bytes, { filter: (file) => file.originalSize <= 15_000_000 && (/surveys_[^/]*\.txt$/i.test(file.name) || /(?:^|\/)ETS[^/]*\.xml$/i.test(file.name)) });
  const names = Object.keys(files), surveys = names.filter((name) => /surveys_[^/]*\.txt$/i.test(name)), xmlFiles = names.filter((name) => /(?:^|\/)ETS[^/]*\.xml$/i.test(name));
  if (surveys.length !== 1) throw new PasonPackageError(surveys.length ? "This package contains multiple survey TXT files. Import a package for one well." : "This package does not contain a Pason surveys_*.txt file.");
  if (xmlFiles.length !== 1) throw new PasonPackageError(xmlFiles.length ? "This package contains multiple ETS XML files. Import a package for one well." : "This package does not contain an ETS XML file.");
  const survey = parsePasonSurvey(strFromU8(files[surveys[0]]), surveys[0]), ets = parseEtsXml(strFromU8(files[xmlFiles[0]]));
  if (!ets.bitRuns.length) throw new PasonPackageError("The ETS XML does not contain usable bit-size and depth records.");
  if (!compatibleNames(survey.name, ets.wellName)) throw new PasonPackageError("The survey TXT and ETS XML appear to describe different wells.");
  const maximumSurveyMd = Math.max(...survey.legs.map((leg) => leg.endMdM)), maximumBitMd = Math.max(...ets.bitRuns.map((run) => run.depthOutM ?? run.depthInM));
  if (Math.abs(maximumSurveyMd - maximumBitMd) > Math.max(100, maximumSurveyMd * 0.1)) throw new PasonPackageError("The survey and ETS depth ranges do not match closely enough to combine safely.");
  const built = buildHoleSections(survey.legs, ets.bitRuns), warnings = [...survey.warnings, ...built.warnings];
  if (ets.incompleteCasings) warnings.push(`${ets.incompleteCasings} incomplete casing ${ets.incompleteCasings === 1 ? "record was" : "records were"} ignored.`);
  return { ...survey, name: ets.wellName || survey.name, packageName, etsFileName: xmlFiles[0], bitRuns: ets.bitRuns, holeSections: built.sections, casings: ets.casings, warnings };
}

export const holeAtMd = (well: PasonWell, legId: string, mdM: number) => { const sections = well.holeSections[legId] ?? []; return sections.find((section, index) => mdM >= section.startMdM && (mdM < section.endMdM || index === sections.length - 1)) ?? null; };
export const casingsAtMd = (well: PasonWell, mdM: number) => well.casings.filter((casing) => mdM >= casing.topMdM && mdM <= casing.bottomMdM);
