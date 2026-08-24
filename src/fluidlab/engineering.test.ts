import { describe, expect, it } from "vitest";
import {
  confirmSection,
  createProject,
  emptyDraft,
  generateProject,
  pointAtMd,
  trajectoryErrors,
  truncateFrom,
  validateProject,
} from "./engineering";
const project = () => {
  const p = createProject("metric");
  confirmSection(p, {
    name: "Surface",
    endMdM: 1000,
    diameterMm: 311,
    color: "#35dfbd",
  });
  confirmSection(p, {
    name: "Lateral",
    endMdM: 2200,
    diameterMm: 216,
    color: "#43aee8",
  });
  return p;
};
describe("sequential KOP/EOC model", () => {
  it("starts empty at zero", () => {
    const p = createProject();
    expect(p.sections).toEqual([]);
    expect(p.unitSystem).toBeNull();
    expect(emptyDraft().endMdM).toBeNull();
  });
  it("confirms ordered sections", () => {
    const p = project();
    expect(p.sections.map((s) => s.endMdM)).toEqual([1000, 2200]);
    expect(validateProject(p)).toEqual([]);
  });
  it("stores user-selected section colors", () => {
    const p = project();
    expect(p.sections.map((s) => s.color)).toEqual(["#35dfbd", "#43aee8"]);
  });
  it("is vertical without trajectory", () => {
    const g = generateProject(project());
    expect(g.totalHorizontalM).toBe(0);
    expect(g.totalVerticalM).toBe(2200);
  });
  it("builds from KOP to horizontal at EOC", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 1800, endCurveMdM: 2000 };
    expect(pointAtMd(p, 1800).inclinationDeg).toBe(0);
    expect(pointAtMd(p, 2000).inclinationDeg).toBe(90);
    expect(pointAtMd(p, 2200).verticalM).toBeCloseTo(pointAtMd(p, 2000).verticalM);
    expect(pointAtMd(p, 2200).horizontalM).toBeGreaterThan(
      pointAtMd(p, 2000).horizontalM,
    );
  });
  it("supports a curve across section boundaries", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 900, endCurveMdM: 1200 };
    const g = generateProject(p);
    expect(g.sections[0].points.some((x) => x.mdM === 900)).toBe(true);
    expect(g.sections[1].points.some((x) => x.mdM === 1200)).toBe(true);
  });
  it("rejects invalid trajectory", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 2000, endCurveMdM: 1800 };
    expect(trajectoryErrors(p).join()).toMatch(/deeper/);
  });
  it("truncates descendants and clears invalid trajectory", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 1800, endCurveMdM: 2000 };
    const result = truncateFrom(p, 0)!;
    expect(result.removedCount).toBe(2);
    expect(result.draft.endMdM).toBe(1000);
    expect(result.trajectoryCleared).toBe(true);
    expect(p.sections).toEqual([]);
  });
  it("rejects older schemas", () =>
    expect(validateProject({ ...project(), version: 3 } as never)).toEqual([
      "Unsupported FluidLab project schema.",
    ]));
});
