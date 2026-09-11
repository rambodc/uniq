import { beforeAll, describe, expect, it } from "vitest";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { strToU8, zipSync } from "fflate";
import {
  buildHoleSections,
  casingsAtMd,
  holeAtMd,
  inspectWellPackage,
  parseEtsXml,
  parseOperationalCsv,
  parseWellPackage,
  WellPackageError,
  summarizeOperations,
} from "./well-package";
import { parseWellSurvey } from "./survey";

beforeAll(() => {
  globalThis.DOMParser = XmlDomParser as unknown as typeof DOMParser;
});
const surveyText = `# Well DataHub Deviation Survey\n# Well Dossier 42 - TEST WELL\n# MD(mKB)\tIncl(deg)\tAzm(deg)\tTVD(mKB)\tNS(m)\tEW(m)\tStatus\tlegId\tparentLegId\n0\t0\t0\t0\t0\t0\tOK\t10\t\n185\t0\t0\t185\t0\t0\tOK\t10\t\n1583\t90\t90\t1000\t0\t500\tOK\t10\t\n2000\t90\t90\t1000\t0\t917\tOK\t10\t\n1595\t90\t90\t1000\t0\t512\tOK\t11\t10\n2500\t90\t90\t1000\t0\t1417\tOK\t11\t10`;
const xml = `<?xml version="1.0"?><ETS xmlns="http://www.caodc.ca/ETS/v3"><WellTours><WellTour><WellName>TEST WELL</WellName><UniqueWellId>TEST/00</UniqueWellId><DayTours><DayTour><Equipment><Bits>
<Bit><BitNo>1</BitNo><Size>349</Size><Manufacturer>A</Manufacturer><SerialNo>one</SerialNo><DepthIn>0</DepthIn><DepthOut>185</DepthOut></Bit>
<Bit><BitNo>2</BitNo><Size>222</Size><Manufacturer>B</Manufacturer><SerialNo>two</SerialNo><DepthIn>185</DepthIn><DepthOut>1000</DepthOut></Bit><Bit><BitNo>2</BitNo><Size>222</Size><Manufacturer>B</Manufacturer><SerialNo>two</SerialNo><DepthIn>185</DepthIn><DepthOut>1583</DepthOut></Bit>
<Bit><BitNo>3</BitNo><Size>159</Size><Manufacturer>C</Manufacturer><BitType>PDC</BitType><SerialNo>three</SerialNo><DepthIn>1583</DepthIn><DepthOut>2500</DepthOut></Bit></Bits></Equipment>
<Tubular><Casings><Casing><Category>SURFACE</Category><Grade>H40</Grade><OutsideDiameter>244.5</OutsideDiameter><InsideDiameter>228.63</InsideDiameter><KBToCasingHead>4.8</KBToCasingHead><KBToCasingBottom>183</KBToCasingBottom></Casing><Casing><Category>BAD</Category><InsideDiameter>157</InsideDiameter><KBToCasingBottom>24</KBToCasingBottom></Casing></Casings></Tubular>
</DayTour></DayTours></WellTour></WellTours></ETS>`;
const csv = `YYYY/MM/DD,HH:MM:SS,Hole Depth (meters),Bit Depth (meters),Top Drive Torque (kN_m),Top Drive Rotary (RPM),Rate Of Penetration (m_per_hr),Rig Gas (percent)\n2026/02/19,17:00:00,184,184,3,110,20,-999.25\n2026/02/19,17:01:00,185,185,5,120,30,2\n2026/02/19,17:02:00,186,185.5,7,130,40,3`;

describe("ETS engineering data", () => {
  it("deduplicates bit snapshots and retains deepest depth-out", () => {
    const parsed = parseEtsXml(xml);
    expect(parsed.bitRuns).toHaveLength(3);
    expect(parsed.bitRuns[1].depthOutM).toBe(1583);
    expect(parsed.casings).toHaveLength(1);
    expect(parsed.incompleteCasings).toBe(1);
  });
  it("builds inherited per-leg 349, 222, and 159 mm schedules", () => {
    const survey = parseWellSurvey(surveyText),
      ets = parseEtsXml(xml),
      built = buildHoleSections(survey.legs, ets.bitRuns);
    expect(built.sections["10"].map((item) => item.diameterMm)).toEqual([
      349, 222, 159,
    ]);
    expect(built.sections["11"].map((item) => item.diameterMm)).toEqual([159]);
  });
  it("rejects malformed XML", () =>
    expect(() => parseEtsXml("<parsererror>malformed</parsererror>")).toThrow(
      WellPackageError,
    ));
});

describe("Well ZIP package", () => {
  const archive = (files: Record<string, string>) =>
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, value]) => [name, strToU8(value)]),
      ),
    );
  const file = (bytes: Uint8Array, name: string) =>
    Object.assign(new Blob([bytes as BlobPart]), { name });
  const manifest = (files: Record<string, string>, name = "job.zip") =>
    inspectWellPackage(file(archive(files), name));
  it("correlates survey, hole, casing, and operational data without persistence", async () => {
    const inspected = await manifest({
      "job/data/surveys_42.txt": surveyText,
      "job/data/ETS_test.xml": xml,
      "job/data/42.csv": csv,
    });
    const well = await parseWellPackage(inspected, { detail: "detailed" });
    expect(well.packageName).toBe("job.zip");
    expect(holeAtMd(well, "10", 100)?.diameterMm).toBe(349);
    expect(casingsAtMd(well, 100)[0].outsideDiameterMm).toBe(244.5);
    expect(well.operationalImport.validObservations).toBe(3);
    expect(
      summarizeOperations(well, 185)?.statistics.find(
        (item) => item.channel.id === "torque",
      )?.average,
    ).toBe(5);
    expect(well.warnings).toContain("1 incomplete casing record was ignored.");
  });
  it("rejects missing, ambiguous, and mismatched packages", async () => {
    await expect(manifest({ "readme.txt": "x" }, "bad.zip")).rejects.toThrow(
      /surveys_/,
    );
    await expect(
      manifest(
        {
          "surveys_a.txt": surveyText,
          "surveys_b.txt": surveyText,
          "ETS.xml": xml,
          "42.csv": csv,
        },
        "bad.zip",
      ),
    ).rejects.toThrow(/multiple survey/);
    const mismatched = await manifest(
      {
        "surveys_a.txt": surveyText,
        "ETS.xml": xml.replaceAll("TEST WELL", "OTHER BORE"),
        "42.csv": csv,
      },
      "bad.zip",
    );
    await expect(
      parseWellPackage(mismatched, { detail: "detailed" }),
    ).rejects.toThrow(/different wells/);
    await expect(
      manifest({ "surveys_a.txt": surveyText, "ETS.xml": xml }, "bad.zip"),
    ).rejects.toThrow(/drilling CSV/);
  });
});

describe("operational CSV", () => {
  it("parses supported channels, ignores sentinels, and retains weighted statistics", () => {
    const parsed = parseOperationalCsv(csv);
    expect(parsed.channels.map((item) => item.id)).toContain("torque");
    expect(parsed.buckets[0].values.gas).toBeUndefined();
    expect(parsed.buckets.at(-1)?.values.rop?.latest).toBe(40);
    expect(parsed.metadata.validObservations).toBe(3);
  });
  it("uses selectable depth resolutions", () => {
    expect(parseOperationalCsv(csv, "detailed").metadata.depthResolutionM).toBe(
      0.25,
    );
    expect(parseOperationalCsv(csv, "balanced").metadata.depthResolutionM).toBe(
      0.5,
    );
    expect(parseOperationalCsv(csv, "compact").metadata.depthResolutionM).toBe(
      1,
    );
  });
  it("rejects missing depth columns and unsupported channels", () => {
    expect(() => parseOperationalCsv("Date,Value\n2026/01/01,2")).toThrow(
      /Hole Depth/,
    );
    expect(() =>
      parseOperationalCsv(
        "Hole Depth (meters),Bit Depth (meters),Unknown\n1,1,2",
      ),
    ).toThrow(/supported operational/);
  });
});

import {
  parseFluidXml,
  FluidCsvCollector,
  finalizeFluids,
} from "./drilling-fluids";
describe("reported drilling fluids", () => {
  const sample =
    "<MudSample><Time>01:00:00-06:00</Time><Density>1030</Density><FunnelViscosity>34</FunnelViscosity><FluidPh>7</FluidPh><WaterLoss>12</WaterLoss><PVT>40</PVT><Depth>120</Depth><Location>SHAKERS</Location></MudSample>";
  const body = `<ETS xmlns="http://www.caodc.ca/ETS/v3"><DayTour><Tours><Tour><StartTime>2025-09-02T20:00:00-06:00</StartTime><EndTime>2025-09-03T08:00:00-06:00</EndTime><MudRecord><MudSamples>${sample}${sample}</MudSamples><MudMaterials><MudMaterial><Product>CLAY</Product><Amount>5</Amount><Unit>SX</Unit></MudMaterial><MudMaterial><Product>CLAY</Product><Amount>5</Amount><Unit>SX</Unit></MudMaterial><MudMaterial><Product>CLAY</Product><Amount>2</Amount><Unit>kg</Unit></MudMaterial></MudMaterials></MudRecord><SolidsControls><SolidsControl><EquipmentName>CENTRIFUGE 1</EquipmentName><HoursRun>8</HoursRun><IntakeDensity>1030</IntakeDensity></SolidsControl></SolidsControls></Tour></Tours></DayTour></ETS>`;
  it("uses tour context across midnight and deduplicates samples/chemical snapshots without conflating units", () => {
    const result = parseFluidXml(
      new DOMParser().parseFromString(
        body.replace(
          "</Tours>",
          body.match(/<Tour>[\s\S]*?<\/Tour>/)![0] + "</Tours>",
        ),
        "application/xml",
      ),
    );
    const samples = result.records.filter((r) => r.category === "sample");
    expect(samples).toHaveLength(1);
    expect(samples[0].time).toBe("2025-09-03T01:00:00-06:00");
    expect(samples[0].mdM).toBe(120);
    expect(samples[0].values.find((v) => v.key === "filtration")?.value).toBe(
      12,
    );
    expect(result.records.filter((r) => r.event.includes("loss"))).toHaveLength(
      0,
    );
    expect(
      result.records.filter((r) => r.category === "chemical"),
    ).toHaveLength(3);
    expect(
      result.records.find((r) => r.category === "solid")?.values[0].value,
    ).toBe(8);
    expect(result.records.find((r) => r.tank === "Combined PVT")?.amount).toBe(
      40,
    );
  });
  it("retains tank notes without depth, named volumes and level units without converting levels to volumes", () => {
    const parser = new FluidCsvCollector();
    parser.header(["Tank 1 Volume (m3)", "Tank 2 Level (cm)", "Memos"]);
    parser.consume(
      ["10", "23", "Tank 1 included,Tank 2 excluded"],
      2,
      "2025/09/02 12:00:00",
      null,
    );
    parser.consume(
      ["", "", "TRANSFER 7m3 FROM ACTIVE TO FLOCK TANK"],
      3,
      "2025/09/02 12:01:00",
      null,
    );
    parser.consume(["-999.25", "", "lost 2m3"], 4, "2025/09/02 12:02:00", null);
    const result = parser.finish("-06:00");
    expect(
      result.records.find((r) => r.tank === "Tank 1" && r.event === "volume")
        ?.amount,
    ).toBe(10);
    expect(result.records.find((r) => r.tank === "Tank 2")?.event).toBe(
      "level",
    );
    expect(
      result.records.filter((r) => ["included", "excluded"].includes(r.event)),
    ).toHaveLength(2);
    expect(result.records.find((r) => r.event === "transfer")).toMatchObject({
      amount: 7,
      unit: "m³",
      mdM: null,
      fromTank: "ACTIVE",
      toTank: "FLOCK TANK",
    });
    expect(
      result.records.find((r) => r.event === "unspecified loss")?.uncertain,
    ).toBe(true);
  });
  it("records conflicts and missing timestamps for review instead of choosing values", () => {
    const result = parseFluidXml(
      new DOMParser().parseFromString(
        body
          .replace(
            sample + sample,
            sample + sample.replace("<PVT>40", "<PVT>44"),
          )
          .replace("01:00:00-06:00", "15:00:00-06:00"),
        "application/xml",
      ),
    );
    expect(result.warnings.some((w) => w.includes("uncertain dates"))).toBe(
      true,
    );
    const original = result.records.find(
      (r) => r.tank === "Combined PVT" && r.at !== null,
    )!;
    const conflict = finalizeFluids([
      original,
      { ...original, id: "other", amount: 100 },
    ]);
    expect(conflict.records.every((r) => r.uncertain)).toBe(true);
    expect(conflict.warnings.some((w) => w.includes("conflicting"))).toBe(true);
  });
});
it("keeps tank-only CSV readings and explicit gaps even without drilling depths", () => {
  const parsed = parseOperationalCsv(
    "YYYY/MM/DD,HH:MM:SS,Tank 1 Volume (m3),Memos\n2025/09/02,12:00:00,10,Tank 1 included\n2025/09/02,12:01:00,-999.25,\n2025/09/02,12:02:00,9,lost 2",
  );
  expect(parsed.metadata.validObservations).toBe(0);
  const collector = new FluidCsvCollector();
  collector.header(["Tank 1 Volume (m3)", "Memos"]);
  collector.consume(["10", ""], 2, "2025/09/02 12:00:00", null);
  collector.consume(["", "lost 2"], 3, "2025/09/02 12:01:00", null);
  const records = collector.finish("-06:00").records;
  expect(
    records.find((r) => r.event === "volume" && r.amount === null),
  ).toBeTruthy();
  expect(records.find((r) => r.event === "unspecified loss")).toMatchObject({
    amount: 2,
    unit: null,
    uncertain: true,
  });
});
