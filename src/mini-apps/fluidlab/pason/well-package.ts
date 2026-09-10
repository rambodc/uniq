import { strFromU8 } from "fflate";
import {
  inspectZip,
  extractZipEntry,
  WellPackageError,
  type ZipEntry,
} from "./zip";
export { WellPackageError } from "./zip";
import { parseWellSurvey, type SurveyFile, type SurveyLeg } from "./survey";

export interface BitRun {
  id: string;
  bitNo: string;
  sizeMm: number;
  manufacturer: string;
  bitType: string;
  serialNo: string;
  depthInM: number;
  depthOutM: number | null;
}
export interface HoleSection {
  id: string;
  legId: string;
  startMdM: number;
  endMdM: number;
  diameterMm: number;
  bit: BitRun | null;
}
export interface CasingString {
  id: string;
  category: string;
  outsideDiameterMm: number;
  insideDiameterMm: number;
  topMdM: number;
  bottomMdM: number;
  grade: string;
}
export type OperationalChannelId =
  | "torque"
  | "rotary"
  | "rop"
  | "gas"
  | "standpipePressure"
  | "differentialPressure"
  | "pumpOutput"
  | "hookLoad"
  | "gamma";
export interface OperationalChannel {
  id: OperationalChannelId;
  label: string;
  unit: string;
}
export type OperationalDetail = "detailed" | "balanced" | "compact";
export interface OperationalValueBucket {
  count: number;
  sum: number;
  minimum: number;
  maximum: number;
  latest: number;
}
export interface OperationalDepthBucket {
  bandStartM: number;
  bitDepthM: number;
  holeDepthM: number;
  sampleCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  values: Partial<Record<OperationalChannelId, OperationalValueBucket>>;
}
export interface OperationalImportMetadata {
  sourceRows: number;
  validObservations: number;
  depthBandCount: number;
  depthResolutionM: number;
  csvSizeBytes: number;
}
export interface OperationalStatistic {
  channel: OperationalChannel;
  count: number;
  minimum: number;
  average: number;
  maximum: number;
  latest: number;
}
export interface OperationalSummary {
  radiusM: number;
  sampleCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  ambiguousLeg: boolean;
  statistics: OperationalStatistic[];
}
export interface WellModel extends SurveyFile {
  packageName: string;
  etsFileName: string;
  csvFileName: string;
  bitRuns: BitRun[];
  holeSections: Record<string, HoleSection[]>;
  casings: CasingString[];
  operationalChannels: OperationalChannel[];
  operationalBuckets: OperationalDepthBucket[];
  operationalImport: OperationalImportMetadata;
}
export interface WellPackageManifest {
  file: Blob;
  entries: ZipEntry[];
  packageName: string;
  surveyFileName: string;
  etsFileName: string;
  csvFileName: string;
  csvSizeBytes: number;
  requiresDetailSelection: boolean;
}
export interface WellImportProgress {
  phase: "extracting" | "parsing" | "building";
  percent: number;
  message: string;
}
export interface ParseWellPackageOptions {
  detail: OperationalDetail;
  signal?: AbortSignal;
}

const number = (value: string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const localName = (node: Node) =>
  (node as Element).localName || node.nodeName.split(":").at(-1) || "";
const elements = (root: Node, name: string) => {
  const found: Element[] = [],
    visit = (node: Node) => {
      if (node.nodeType === 1 && localName(node) === name)
        found.push(node as Element);
      for (const child of node.childNodes ? Array.from(node.childNodes) : [])
        visit(child);
    };
  visit(root);
  return found;
};
const text = (element: Element, name: string) =>
  elements(element, name)[0]?.textContent?.trim() ?? "";
const directValues = (element: Element) =>
  Object.fromEntries(
    Array.from(element.childNodes)
      .filter((child): child is Element => child.nodeType === 1)
      .map((child) => [localName(child), child.textContent?.trim() ?? ""]),
  );

const channelDefinitions: {
  id: OperationalChannelId;
  aliases: string[];
  label: string;
}[] = [
  { id: "torque", aliases: ["top drive torque"], label: "Top drive torque" },
  { id: "rotary", aliases: ["top drive rotary"], label: "Rotary speed" },
  {
    id: "rop",
    aliases: ["rate of penetration", "rop"],
    label: "Rate of penetration",
  },
  { id: "gas", aliases: ["gas"], label: "Gas" },
  {
    id: "standpipePressure",
    aliases: ["standpipe pressure"],
    label: "Standpipe pressure",
  },
  {
    id: "differentialPressure",
    aliases: ["differential pressure"],
    label: "Differential pressure",
  },
  {
    id: "pumpOutput",
    aliases: ["total pump output"],
    label: "Total pump output",
  },
  { id: "hookLoad", aliases: ["hook load"], label: "Hook load" },
  { id: "gamma", aliases: ["gamma"], label: "Gamma" },
];
const csvCells = (line: string) => {
  const cells: string[] = [];
  let value = "",
    quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
};
const headerName = (value: string) =>
  value
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
const headerUnit = (value: string) =>
  value.match(/\(([^)]*)\)\s*$/)?.[1]?.replaceAll("_", " ") ?? "";
const usableOperationalNumber = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > -900 ? parsed : null;
};

export const operationalResolution = (detail: OperationalDetail) =>
  detail === "detailed" ? 0.25 : detail === "balanced" ? 0.5 : 1;

class OperationalCsvAggregator {
  private remainder = "";
  private headersParsed = false;
  private rowCount = 0;
  private validCount = 0;
  private holeIndex = -1;
  private bitIndex = -1;
  private dateIndex = -1;
  private timeIndex = -1;
  private depthFactor = 1;
  private mapped: {
    id: OperationalChannelId;
    label: string;
    unit: string;
    index: number;
  }[] = [];
  private buckets = new Map<number, OperationalDepthBucket>();
  readonly decoder = new TextDecoder();
  constructor(
    readonly resolutionM: number,
    readonly csvSizeBytes = 0,
  ) {}
  push(chunk: Uint8Array, final = false) {
    this.remainder += this.decoder.decode(chunk, { stream: !final });
    if (this.remainder.length > 1_000_000 && !this.remainder.includes("\n"))
      throw new WellPackageError(
        "The drilling CSV contains an unsafe line longer than 1 MB.",
      );
    const lines = this.remainder.split("\n");
    if (final) this.remainder = "";
    else this.remainder = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (line.length > 1_000_000)
        throw new WellPackageError(
          "The drilling CSV contains an unsafe line longer than 1 MB.",
        );
      if (line.trim()) this.consume(line);
    }
  }
  private consume(line: string) {
    if (!this.headersParsed) {
      const headers = csvCells(line.replace(/^\uFEFF/, "")),
        names = headers.map(headerName);
      const find = (...aliases: string[]) =>
        names.findIndex((name) =>
          aliases.some((alias) => name === alias || name.endsWith(` ${alias}`)),
        );
      this.dateIndex = find("yyyy/mm/dd", "date");
      this.timeIndex = find("hh:mm:ss", "time");
      this.holeIndex = find("hole depth");
      this.bitIndex = find("bit depth");
      if (this.holeIndex < 0 || this.bitIndex < 0)
        throw new WellPackageError(
          "The drilling CSV is missing Hole Depth or Bit Depth.",
        );
      const depthUnit =
        `${headerUnit(headers[this.bitIndex])} ${headerUnit(headers[this.holeIndex])}`.toLowerCase();
      this.depthFactor = /\b(ft|feet|foot)\b/.test(depthUnit) ? 0.3048 : 1;
      this.mapped = channelDefinitions.flatMap((definition) => {
        const index = find(...definition.aliases);
        return index < 0
          ? []
          : [{ ...definition, index, unit: headerUnit(headers[index]) }];
      });
      if (!this.mapped.length)
        throw new WellPackageError(
          "The drilling CSV does not contain supported operational channels.",
        );
      this.headersParsed = true;
      return;
    }
    this.rowCount += 1;
    if (this.rowCount > 5_000_000)
      throw new WellPackageError(
        "The drilling CSV exceeds the safe limit of 5 million rows.",
      );
    const cells = csvCells(line),
      rawHole = usableOperationalNumber(cells[this.holeIndex]),
      rawBit = usableOperationalNumber(cells[this.bitIndex]);
    if (rawHole == null || rawBit == null || rawHole < 0 || rawBit < 0) return;
    const values: Partial<Record<OperationalChannelId, number>> = {};
    for (const channel of this.mapped) {
      const value = usableOperationalNumber(cells[channel.index]);
      if (value != null) values[channel.id] = value;
    }
    if (!Object.keys(values).length) return;
    const holeDepthM = rawHole * this.depthFactor,
      bitDepthM = rawBit * this.depthFactor,
      band = Math.floor((bitDepthM + 1e-9) / this.resolutionM),
      bandStartM = band * this.resolutionM;
    const timestamp = [cells[this.dateIndex] ?? "", cells[this.timeIndex] ?? ""]
      .filter(Boolean)
      .join(" ");
    const bucket = this.buckets.get(band) ?? {
      bandStartM,
      bitDepthM,
      holeDepthM,
      sampleCount: 0,
      firstTimestamp: timestamp,
      lastTimestamp: timestamp,
      values: {},
    };
    bucket.sampleCount += 1;
    bucket.bitDepthM = bitDepthM;
    bucket.holeDepthM = holeDepthM;
    bucket.lastTimestamp = timestamp || bucket.lastTimestamp;
    for (const channel of this.mapped) {
      const value = values[channel.id];
      if (value == null) continue;
      const aggregate = bucket.values[channel.id];
      bucket.values[channel.id] = aggregate
        ? {
            count: aggregate.count + 1,
            sum: aggregate.sum + value,
            minimum: Math.min(aggregate.minimum, value),
            maximum: Math.max(aggregate.maximum, value),
            latest: value,
          }
        : {
            count: 1,
            sum: value,
            minimum: value,
            maximum: value,
            latest: value,
          };
    }
    this.buckets.set(band, bucket);
    this.validCount += 1;
    if (this.buckets.size > 100_000)
      throw new WellPackageError(
        "The drilling CSV creates too many depth bands to display safely.",
      );
  }
  finish() {
    if (!this.headersParsed)
      throw new WellPackageError("The drilling CSV does not contain a header.");
    if (!this.validCount)
      throw new WellPackageError(
        "The drilling CSV contains no usable operational samples.",
      );
    return {
      channels: this.mapped.map(({ id, label, unit }) => ({ id, label, unit })),
      buckets: [...this.buckets.values()].sort(
        (a, b) => a.bandStartM - b.bandStartM,
      ),
      metadata: {
        sourceRows: this.rowCount,
        validObservations: this.validCount,
        depthBandCount: this.buckets.size,
        depthResolutionM: this.resolutionM,
        csvSizeBytes: this.csvSizeBytes,
      },
    };
  }
}

export function parseOperationalCsv(
  csv: string,
  detail: OperationalDetail = "detailed",
) {
  const parser = new OperationalCsvAggregator(
    operationalResolution(detail),
    new TextEncoder().encode(csv).byteLength,
  );
  parser.push(new TextEncoder().encode(csv), true);
  return parser.finish();
}

export function parseEtsXml(xml: string) {
  if (typeof DOMParser === "undefined")
    throw new WellPackageError("This browser cannot read ETS XML files.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (
    elements(document, "parsererror").length ||
    localName(document.documentElement) !== "ETS"
  )
    throw new WellPackageError("The ETS XML file is malformed.");
  const snapshots = elements(document, "Bit").flatMap((element) => {
    const values = directValues(element),
      size = number(values.Size),
      depthIn = number(values.DepthIn);
    if (!size || size <= 0 || depthIn == null || depthIn < 0) return [];
    return [
      {
        bitNo: values.BitNo || "",
        sizeMm: size,
        manufacturer: values.Manufacturer || "",
        bitType: values.BitType || "",
        serialNo: values.SerialNo || "",
        depthInM: depthIn,
        depthOutM: number(values.DepthOut),
      },
    ];
  });
  const grouped = new Map<string, BitRun>();
  for (const bit of snapshots) {
    const key = [
      bit.bitNo.toLowerCase(),
      bit.serialNo.toLowerCase(),
      bit.sizeMm,
      bit.depthInM,
    ].join("|");
    const current = grouped.get(key),
      deepest = Math.max(current?.depthOutM ?? -1, bit.depthOutM ?? -1);
    grouped.set(key, {
      ...current,
      ...bit,
      id: key,
      depthOutM: deepest >= bit.depthInM ? deepest : null,
    });
  }
  const bitRuns = [...grouped.values()].sort(
    (a, b) =>
      a.depthInM - b.depthInM ||
      (a.depthOutM ?? Infinity) - (b.depthOutM ?? Infinity),
  );
  const casings = new Map<string, CasingString>();
  let incompleteCasings = 0;
  for (const element of elements(document, "Casing")) {
    const values = directValues(element),
      od = number(values.OutsideDiameter),
      id = number(values.InsideDiameter),
      top = number(values.KBToCasingHead),
      bottom = number(values.KBToCasingBottom);
    if (
      !od ||
      !id ||
      top == null ||
      bottom == null ||
      od <= id ||
      bottom <= top
    ) {
      incompleteCasings += 1;
      continue;
    }
    const key = [values.Category, od, id, top, bottom].join("|");
    casings.set(key, {
      id: key,
      category: values.Category || "Casing",
      outsideDiameterMm: od,
      insideDiameterMm: id,
      topMdM: top,
      bottomMdM: bottom,
      grade: values.Grade || "",
    });
  }
  return {
    wellName: text(document.documentElement, "WellName"),
    uniqueWellId: text(document.documentElement, "UniqueWellId"),
    bitRuns,
    casings: [...casings.values()].sort((a, b) => a.bottomMdM - b.bottomMdM),
    incompleteCasings,
  };
}

function bestBit(
  runs: BitRun[],
  leg: SurveyLeg,
  start: number,
  end: number,
  size: number,
) {
  const eligible = runs.filter(
    (run) =>
      run.sizeMm === size &&
      run.depthInM <= start + 0.05 &&
      (run.depthOutM == null ||
        run.depthOutM >= Math.min(end, leg.endMdM) - 0.05),
  );
  return (
    eligible.sort(
      (a, b) =>
        Math.abs((a.depthOutM ?? leg.endMdM) - leg.endMdM) -
        Math.abs((b.depthOutM ?? leg.endMdM) - leg.endMdM),
    )[0] ?? null
  );
}

export function buildHoleSections(legs: SurveyLeg[], bitRuns: BitRun[]) {
  const warnings: string[] = [],
    transitions = new Map<number, Set<number>>();
  for (const run of bitRuns) {
    const depth = Math.round(run.depthInM * 100) / 100;
    const sizes = transitions.get(depth) ?? new Set<number>();
    sizes.add(run.sizeMm);
    transitions.set(depth, sizes);
  }
  const confirmed = [...transitions]
    .flatMap(([depth, sizes]) => {
      if (sizes.size > 1) {
        warnings.push(
          `Conflicting bit sizes were reported at MD ${depth.toFixed(2)} m; that transition was not applied.`,
        );
        return [];
      }
      return [{ depth, size: [...sizes][0] }];
    })
    .sort((a, b) => a.depth - b.depth);
  const sections: Record<string, HoleSection[]> = {};
  for (const leg of legs) {
    const inherited = confirmed
        .filter((item) => item.depth <= leg.startMdM)
        .at(-1),
      within = confirmed.filter(
        (item) => item.depth > leg.startMdM && item.depth < leg.endMdM,
      );
    const rawSchedule = inherited
      ? [{ depth: leg.startMdM, size: inherited.size }, ...within]
      : within;
    const schedule = rawSchedule.filter(
      (item, index) => index === 0 || item.size !== rawSchedule[index - 1].size,
    );
    sections[leg.id] = schedule
      .map((item, index) => {
        const end = schedule[index + 1]?.depth ?? leg.endMdM;
        return {
          id: `${leg.id}-${item.depth}-${item.size}`,
          legId: leg.id,
          startMdM: item.depth,
          endMdM: end,
          diameterMm: item.size,
          bit: bestBit(bitRuns, leg, item.depth, end, item.size),
        };
      })
      .filter((item) => item.endMdM > item.startMdM);
    if (!sections[leg.id].length)
      warnings.push(
        `No confirmed bit-size interval could be assigned to ${leg.name}.`,
      );
  }
  return { sections, warnings };
}

function compatibleNames(survey: string, ets: string) {
  const words = (value: string) =>
      new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []),
    a = words(survey),
    b = words(ets);
  if (!a.size || !b.size) return true;
  return (
    [...a].filter((word) => word.length > 1 && b.has(word)).length >=
    Math.min(3, a.size)
  );
}

const surveyPattern = /surveys_[^/]*\.txt$/i,
  etsPattern = /(?:^|\/)ETS[^/]*\.xml$/i,
  csvPattern = /(?:^|\/)[^/]+\.csv$/i;

export async function inspectWellPackage(
  file: File | (Blob & { name?: string }),
  signal?: AbortSignal,
): Promise<WellPackageManifest> {
  const entries = await inspectZip(file, signal);
  const surveys = entries.filter((entry) => surveyPattern.test(entry.name)),
    xmlFiles = entries.filter((entry) => etsPattern.test(entry.name)),
    csvFiles = entries.filter((entry) => csvPattern.test(entry.name));
  if (surveys.length !== 1)
    throw new WellPackageError(
      surveys.length
        ? "This package contains multiple survey TXT files. Import a package for one well."
        : "This package does not contain a surveys_*.txt file.",
    );
  if (xmlFiles.length !== 1)
    throw new WellPackageError(
      xmlFiles.length
        ? "This package contains multiple ETS XML files. Import a package for one well."
        : "This package does not contain an ETS XML file.",
    );
  if (csvFiles.length !== 1)
    throw new WellPackageError(
      csvFiles.length
        ? "This package contains multiple drilling CSV files. Import a package for one well."
        : "This package does not contain a drilling CSV file.",
    );
  if (
    surveys[0].originalSize > 5_000_000 ||
    xmlFiles[0].originalSize > 15_000_000
  )
    throw new WellPackageError(
      "The survey TXT or ETS XML exceeds its safe extraction limit.",
    );
  if (csvFiles[0].originalSize > 2_000_000_000)
    throw new WellPackageError(
      "The drilling CSV exceeds the 2 GB uncompressed limit.",
    );
  return {
    file,
    entries,
    packageName: file.name || "well-package.zip",
    surveyFileName: surveys[0].name,
    etsFileName: xmlFiles[0].name,
    csvFileName: csvFiles[0].name,
    csvSizeBytes: csvFiles[0].originalSize,
    requiresDetailSelection: csvFiles[0].originalSize > 15_000_000,
  };
}

async function extractSelected(
  manifest: WellPackageManifest,
  options: ParseWellPackageOptions,
  onProgress?: (progress: WellImportProgress) => void,
) {
  const texts = new Map<string, Uint8Array[]>(),
    parser = new OperationalCsvAggregator(
      operationalResolution(options.detail),
      manifest.csvSizeBytes,
    );
  const names = [
    manifest.surveyFileName,
    manifest.etsFileName,
    manifest.csvFileName,
  ];
  const selected = names.map((name) => {
    const entry = manifest.entries.find((item) => item.name === name);
    if (!entry) throw new WellPackageError("An expected ZIP entry is missing.");
    return entry;
  });
  const total = selected.reduce((sum, entry) => sum + entry.compressedSize, 0);
  let completed = 0;
  for (const entry of selected) {
    const csv = entry.name === manifest.csvFileName,
      chunks: Uint8Array[] = [];
    await extractZipEntry(
      manifest.file,
      entry,
      csv
        ? 2_000_000_000
        : entry.name === manifest.surveyFileName
          ? 5_000_000
          : 15_000_000,
      (chunk, final) => {
        if (csv) parser.push(chunk, final);
        else chunks.push(chunk.slice());
      },
      options.signal,
      (read) =>
        onProgress?.({
          phase: "extracting",
          percent: Math.min(90, ((completed + read) / Math.max(1, total)) * 90),
          message: `Processing ${entry.name}…`,
        }),
    );
    if (!csv) texts.set(entry.name, chunks);
    completed += entry.compressedSize;
  }
  const join = (name: string) => {
    const chunks = texts.get(name)!;
    const joined = new Uint8Array(
      chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return strFromU8(joined);
  };
  onProgress?.({
    phase: "parsing",
    percent: 94,
    message: "Combining survey and engineering records…",
  });
  return {
    surveyText: join(manifest.surveyFileName),
    etsText: join(manifest.etsFileName),
    operations: parser.finish(),
  };
}

export async function parseWellPackage(
  manifest: WellPackageManifest,
  options: ParseWellPackageOptions,
  onProgress?: (progress: WellImportProgress) => void,
): Promise<WellModel> {
  const extracted = await extractSelected(manifest, options, onProgress);
  const survey = parseWellSurvey(extracted.surveyText, manifest.surveyFileName),
    ets = parseEtsXml(extracted.etsText),
    operations = extracted.operations;
  if (!ets.bitRuns.length)
    throw new WellPackageError(
      "The ETS XML does not contain usable bit-size and depth records.",
    );
  if (!compatibleNames(survey.name, ets.wellName))
    throw new WellPackageError(
      "The survey TXT and ETS XML appear to describe different wells.",
    );
  const maximumSurveyMd = Math.max(...survey.legs.map((leg) => leg.endMdM)),
    maximumBitMd = Math.max(
      ...ets.bitRuns.map((run) => run.depthOutM ?? run.depthInM),
    );
  if (
    Math.abs(maximumSurveyMd - maximumBitMd) >
    Math.max(100, maximumSurveyMd * 0.1)
  )
    throw new WellPackageError(
      "The survey and ETS depth ranges do not match closely enough to combine safely.",
    );
  const built = buildHoleSections(survey.legs, ets.bitRuns),
    warnings = [...survey.warnings, ...built.warnings];
  if (ets.incompleteCasings)
    warnings.push(
      `${ets.incompleteCasings} incomplete casing ${ets.incompleteCasings === 1 ? "record was" : "records were"} ignored.`,
    );
  onProgress?.({
    phase: "building",
    percent: 100,
    message: "Building the 3D well…",
  });
  return {
    ...survey,
    name: ets.wellName || survey.name,
    packageName: manifest.packageName,
    etsFileName: manifest.etsFileName,
    csvFileName: manifest.csvFileName,
    bitRuns: ets.bitRuns,
    holeSections: built.sections,
    casings: ets.casings,
    operationalChannels: operations.channels,
    operationalBuckets: operations.buckets,
    operationalImport: operations.metadata,
    warnings,
  };
}

export const holeAtMd = (well: WellModel, legId: string, mdM: number) => {
  const sections = well.holeSections[legId] ?? [];
  return (
    sections.find(
      (section, index) =>
        mdM >= section.startMdM &&
        (mdM < section.endMdM || index === sections.length - 1),
    ) ?? null
  );
};
export const casingsAtMd = (well: WellModel, mdM: number) =>
  well.casings.filter(
    (casing) => mdM >= casing.topMdM && mdM <= casing.bottomMdM,
  );
export function summarizeOperations(
  well: WellModel,
  mdM: number,
  radiusM = 2,
): OperationalSummary | null {
  const nearby = well.operationalBuckets.filter(
    (sample) =>
      sample.bandStartM <= mdM + radiusM &&
      sample.bandStartM + well.operationalImport.depthResolutionM >=
        mdM - radiusM,
  );
  if (!nearby.length) return null;
  const statistics = well.operationalChannels.flatMap((channel) => {
    const values = nearby.flatMap((bucket) =>
      bucket.values[channel.id] ? [bucket.values[channel.id]!] : [],
    );
    if (!values.length) return [];
    const count = values.reduce((sum, value) => sum + value.count, 0);
    return [
      {
        channel,
        count,
        minimum: Math.min(...values.map((value) => value.minimum)),
        average: values.reduce((sum, value) => sum + value.sum, 0) / count,
        maximum: Math.max(...values.map((value) => value.maximum)),
        latest: values.at(-1)!.latest,
      },
    ];
  });
  return {
    radiusM,
    sampleCount: nearby.reduce((sum, bucket) => sum + bucket.sampleCount, 0),
    firstTimestamp: nearby[0].firstTimestamp,
    lastTimestamp: nearby.at(-1)!.lastTimestamp,
    ambiguousLeg:
      well.legs.filter((leg) => mdM >= leg.startMdM && mdM <= leg.endMdM)
        .length > 1,
    statistics,
  };
}
