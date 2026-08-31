import { beforeAll, describe, expect, it } from "vitest";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { strToU8, zipSync } from "fflate";
import { buildHoleSections, casingsAtMd, holeAtMd, inspectWellPackage, parseEtsXml, parseOperationalCsv, parseWellPackage, WellPackageError, summarizeOperations } from "./well-package";
import { parseWellSurvey } from "./survey";

beforeAll(() => { globalThis.DOMParser = XmlDomParser as unknown as typeof DOMParser; });
const surveyText = `# Well DataHub Deviation Survey\n# Well Dossier 42 - TEST WELL\n# MD(mKB)\tIncl(deg)\tAzm(deg)\tTVD(mKB)\tNS(m)\tEW(m)\tStatus\tlegId\tparentLegId\n0\t0\t0\t0\t0\t0\tOK\t10\t\n185\t0\t0\t185\t0\t0\tOK\t10\t\n1583\t90\t90\t1000\t0\t500\tOK\t10\t\n2000\t90\t90\t1000\t0\t917\tOK\t10\t\n1595\t90\t90\t1000\t0\t512\tOK\t11\t10\n2500\t90\t90\t1000\t0\t1417\tOK\t11\t10`;
const xml = `<?xml version="1.0"?><ETS xmlns="http://www.caodc.ca/ETS/v3"><WellTours><WellTour><WellName>TEST WELL</WellName><UniqueWellId>TEST/00</UniqueWellId><DayTours><DayTour><Equipment><Bits>
<Bit><BitNo>1</BitNo><Size>349</Size><Manufacturer>A</Manufacturer><SerialNo>one</SerialNo><DepthIn>0</DepthIn><DepthOut>185</DepthOut></Bit>
<Bit><BitNo>2</BitNo><Size>222</Size><Manufacturer>B</Manufacturer><SerialNo>two</SerialNo><DepthIn>185</DepthIn><DepthOut>1000</DepthOut></Bit><Bit><BitNo>2</BitNo><Size>222</Size><Manufacturer>B</Manufacturer><SerialNo>two</SerialNo><DepthIn>185</DepthIn><DepthOut>1583</DepthOut></Bit>
<Bit><BitNo>3</BitNo><Size>159</Size><Manufacturer>C</Manufacturer><BitType>PDC</BitType><SerialNo>three</SerialNo><DepthIn>1583</DepthIn><DepthOut>2500</DepthOut></Bit></Bits></Equipment>
<Tubular><Casings><Casing><Category>SURFACE</Category><Grade>H40</Grade><OutsideDiameter>244.5</OutsideDiameter><InsideDiameter>228.63</InsideDiameter><KBToCasingHead>4.8</KBToCasingHead><KBToCasingBottom>183</KBToCasingBottom></Casing><Casing><Category>BAD</Category><InsideDiameter>157</InsideDiameter><KBToCasingBottom>24</KBToCasingBottom></Casing></Casings></Tubular>
</DayTour></DayTours></WellTour></WellTours></ETS>`;
const csv = `YYYY/MM/DD,HH:MM:SS,Hole Depth (meters),Bit Depth (meters),Top Drive Torque (kN_m),Top Drive Rotary (RPM),Rate Of Penetration (m_per_hr),Rig Gas (percent)\n2026/02/19,17:00:00,184,184,3,110,20,-999.25\n2026/02/19,17:01:00,185,185,5,120,30,2\n2026/02/19,17:02:00,186,185.5,7,130,40,3`;

describe("ETS engineering data", () => {
  it("deduplicates bit snapshots and retains deepest depth-out", () => { const parsed = parseEtsXml(xml); expect(parsed.bitRuns).toHaveLength(3); expect(parsed.bitRuns[1].depthOutM).toBe(1583); expect(parsed.casings).toHaveLength(1); expect(parsed.incompleteCasings).toBe(1); });
  it("builds inherited per-leg 349, 222, and 159 mm schedules", () => { const survey = parseWellSurvey(surveyText), ets = parseEtsXml(xml), built = buildHoleSections(survey.legs, ets.bitRuns); expect(built.sections["10"].map((item) => item.diameterMm)).toEqual([349, 222, 159]); expect(built.sections["11"].map((item) => item.diameterMm)).toEqual([159]); });
  it("rejects malformed XML", () => expect(() => parseEtsXml("<parsererror>malformed</parsererror>")).toThrow(WellPackageError));
});

describe("Well ZIP package", () => {
  const archive = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])));
  const file = (bytes: Uint8Array, name: string) => Object.assign(new Blob([bytes as BlobPart]), { name });
  const manifest = (files: Record<string, string>, name = "job.zip") => inspectWellPackage(file(archive(files), name));
  it("correlates survey, hole, casing, and operational data without persistence", async () => { const inspected = await manifest({ "job/data/surveys_42.txt": surveyText, "job/data/ETS_test.xml": xml, "job/data/42.csv": csv }); const well = await parseWellPackage(inspected, { detail: "detailed" }); expect(well.packageName).toBe("job.zip"); expect(holeAtMd(well, "10", 100)?.diameterMm).toBe(349); expect(casingsAtMd(well, 100)[0].outsideDiameterMm).toBe(244.5); expect(well.operationalImport.validObservations).toBe(3); expect(summarizeOperations(well, 185)?.statistics.find((item) => item.channel.id === "torque")?.average).toBe(5); expect(well.warnings).toContain("1 incomplete casing record was ignored."); });
  it("rejects missing, ambiguous, and mismatched packages", async () => { await expect(manifest({ "readme.txt": "x" }, "bad.zip")).rejects.toThrow(/surveys_/); await expect(manifest({ "surveys_a.txt": surveyText, "surveys_b.txt": surveyText, "ETS.xml": xml, "42.csv": csv }, "bad.zip")).rejects.toThrow(/multiple survey/); const mismatched = await manifest({ "surveys_a.txt": surveyText, "ETS.xml": xml.replaceAll("TEST WELL", "OTHER BORE"), "42.csv": csv }, "bad.zip"); await expect(parseWellPackage(mismatched, { detail: "detailed" })).rejects.toThrow(/different wells/); await expect(manifest({ "surveys_a.txt": surveyText, "ETS.xml": xml }, "bad.zip")).rejects.toThrow(/drilling CSV/); });
});

describe("operational CSV", () => {
  it("parses supported channels, ignores sentinels, and retains weighted statistics", () => { const parsed = parseOperationalCsv(csv); expect(parsed.channels.map((item) => item.id)).toContain("torque"); expect(parsed.buckets[0].values.gas).toBeUndefined(); expect(parsed.buckets.at(-1)?.values.rop?.latest).toBe(40); expect(parsed.metadata.validObservations).toBe(3); });
  it("uses selectable depth resolutions", () => { expect(parseOperationalCsv(csv, "detailed").metadata.depthResolutionM).toBe(.25); expect(parseOperationalCsv(csv, "balanced").metadata.depthResolutionM).toBe(.5); expect(parseOperationalCsv(csv, "compact").metadata.depthResolutionM).toBe(1); });
  it("rejects missing depth columns and unsupported channels", () => { expect(() => parseOperationalCsv("Date,Value\n2026/01/01,2")).toThrow(/Hole Depth/); expect(() => parseOperationalCsv("Hole Depth (meters),Bit Depth (meters),Unknown\n1,1,2")).toThrow(/supported operational/); });
});
