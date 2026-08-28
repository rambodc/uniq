import { describe, expect, it } from "vitest";
import { clampLegMd, metresToSurveyDisplay, parseWellSurvey, pointAtLegMd, SurveyParseError, surveyDisplayToMetres, tangentAtLegMd, type SurveyLeg } from "./survey";

const metric = `# Well DataHub Deviation Survey
# Well Dossier 42 - TEST WELL
#
# MD(mKB)\tIncl(deg)\tAzm(deg)\tTVD(mKB)\tNS(m)\tEW(m)\tStatus\tlegId\tparentLegId
0\t0\t0\t0\t0\t0\tOK\t10\t
100\t30\t90\t95\t0\t25\tOK\t10\t
50\t5\t10\t49\t1\t2\tOK\t11\t10
150\t90\t90\t100\t3\t80\tOK\t11\t10`;

describe("Well survey parsing", () => {
  it("extracts metadata, coordinates, and related legs", () => {
    const result = parseWellSurvey(metric, "survey.txt");
    expect(result.name).toBe("TEST WELL"); expect(result.dossierId).toBe("42"); expect(result.sourceUnit).toBe("metric");
    expect(result.legs).toHaveLength(2); expect(result.legs[1].parentId).toBe("10"); expect(result.legs[0].stations[1].eastM).toBe(25);
  });
  it("rejects missing headers and files without stations", () => {
    expect(() => parseWellSurvey("not a survey")).toThrow(SurveyParseError);
    expect(() => parseWellSurvey("# MD(m)\tIncl(deg)\tAzm(deg)\tTVD(m)\tNS(m)\tEW(m)\tlegId\n")).toThrow(/No complete/);
  });
  it("sorts stations, replaces duplicate MDs, and reports malformed rows", () => {
    const result = parseWellSurvey(metric + "\n100\t31\t91\t96\t1\t26\tOK\t10\t\nbad\t0\t0\t0\t0\t0\tOK\t10\t");
    expect(result.legs[0].stations).toHaveLength(2); expect(result.legs[0].stations[1].eastM).toBe(26); expect(result.warnings).toHaveLength(2);
  });
  it("converts imperial headers to internal metres", () => {
    const result = parseWellSurvey(metric.replaceAll("(mKB)", "(ftKB)").replaceAll("NS(m)", "NS(ft)").replaceAll("EW(m)", "EW(ft)"));
    expect(result.sourceUnit).toBe("imperial"); expect(result.legs[0].endMdM).toBeCloseTo(30.48);
    expect(surveyDisplayToMetres(metresToSurveyDisplay(100, true), true)).toBeCloseTo(100);
  });
});

describe("survey geometry", () => {
  const leg: SurveyLeg = parseWellSurvey(metric).legs[0];
  it("clamps and interpolates measured depth", () => {
    expect(clampLegMd(leg, -10)).toBe(0); expect(clampLegMd(leg, 200)).toBe(100);
    expect(pointAtLegMd(leg, 50)).toEqual({ x: 12.5, y: -47.5, z: 0 });
  });
  it("calculates a normalized tangent and handles a zero-length leg", () => {
    expect(Math.hypot(...Object.values(tangentAtLegMd(leg, 50)))).toBeCloseTo(1);
    const short = { ...leg, startMdM: 0, endMdM: 0, stations: [leg.stations[0]] };
    expect(tangentAtLegMd(short, 0)).toEqual({ x: 0, y: -1, z: 0 });
  });
});
