import { describe, expect, it } from "vitest";
import { createPreset, feetToMetres, generateWell, inchesToMm, interpolateStation, metresToFeet, mmToInches, parseDesign, parseProjectJson, projectFileName, sectionStations, serializeDesign, validateDesign } from "./model";

describe("3D wellbore model", () => {
  it("round-trips metric and imperial values", () => {
    expect(feetToMetres(metresToFeet(1234))).toBeCloseTo(1234, 8);
    expect(inchesToMm(mmToInches(311.2))).toBeCloseTo(311.2, 8);
  });
  it("builds a vertical well with MD equal to TVD", () => {
    const well = generateWell(createPreset("vertical"));
    expect(well.errors).toEqual([]);
    expect(well.summary.totalMd).toBeCloseTo(well.summary.tvd, 5);
    expect(well.summary.horizontalDisplacement).toBeCloseTo(0, 5);
  });
  it("places KOP and end of build for a directional well", () => {
    const design = createPreset("directional"), well = generateWell(design);
    expect(well.summary.kickoffMd).toBe(design.main.kickoffMd);
    expect(well.summary.endBuildMd).toBeCloseTo(design.main.kickoffMd + design.main.targetInclination / design.main.buildRate * 30, 4);
    expect(well.summary.finalInclination).toBeCloseTo(55, 5);
  });
  it("builds a horizontal trajectory with displacement", () => {
    const well = generateWell(createPreset("horizontal"));
    expect(well.summary.finalInclination).toBeCloseTo(90, 5);
    expect(well.summary.horizontalDisplacement).toBeGreaterThan(2000);
    expect(well.summary.totalMd).toBeGreaterThan(well.summary.tvd);
  });
  it("creates three branches from interpolated parent stations", () => {
    const design = createPreset("multilateral"), well = generateWell(design);
    expect(Object.keys(well.branches)).toHaveLength(3);
    design.branches.forEach((branch) => expect(well.branches[branch.id][0].md).toBeCloseTo(branch.tieInMd, 5));
  });
  it("interpolates MD and segments hole sections", () => {
    const design = createPreset("horizontal"), well = generateWell(design);
    expect(interpolateStation(well.main, 1000).tvd).toBeCloseTo(1000, 2);
    const points = sectionStations(well.main, design.sections[1]);
    expect(points[0].md).toBe(design.sections[1].startMd);
    expect(points.at(-1)!.md).toBe(design.sections[1].endMd);
  });
  it("rejects invalid architecture and section overlaps", () => {
    const design = createPreset("horizontal");
    design.main.buildRate = 0;
    design.sections[1].startMd = design.sections[0].endMd - 10;
    expect(validateDesign(design).length).toBeGreaterThanOrEqual(2);
  });
  it("round-trips versioned share payloads and rejects unsupported versions", () => {
    const design = createPreset("multilateral");
    expect(parseDesign(serializeDesign(design))).toEqual(design);
    expect(parseDesign(serializeDesign({ ...design, version: 2 as 1 }))).toBeNull();
    expect(parseDesign(serializeDesign({ ...design, sections: [] }))).toBeNull();
    expect(parseDesign("not-valid")).toBeNull();
  });
  it("round-trips portable project files and rejects malformed values", () => {
    const design=createPreset("horizontal");
    expect(parseProjectJson(JSON.stringify(design))).toEqual(design);
    expect(parseProjectJson(JSON.stringify({...design,main:{...design.main,azimuth:null}}))).toBeNull();
    expect(parseProjectJson(JSON.stringify({...design,version:2}))).toBeNull();
    expect(parseProjectJson("{")).toBeNull();
    expect(projectFileName(" Well A / 01 ")).toBe("well-a-01.fluidlab.json");
  });
});
