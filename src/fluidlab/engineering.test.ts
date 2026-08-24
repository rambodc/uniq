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
  const p = createProject();
  confirmSection(p, {
    name: "Surface",
    endMdM: 1000,
    referenceTvdM: 980,
    diameterMm: 311,
  });
  confirmSection(p, {
    name: "Lateral",
    endMdM: 2200,
    referenceTvdM: null,
    diameterMm: 216,
  });
  return p;
};
describe("sequential KOP/EOC model", () => {
  it("starts empty at zero", () => {
    const p = createProject();
    expect(p.sections).toEqual([]);
    expect(emptyDraft().endMdM).toBeNull();
  });
  it("confirms ordered sections", () => {
    const p = project();
    expect(p.sections.map((s) => s.endMdM)).toEqual([1000, 2200]);
    expect(validateProject(p)).toEqual([]);
  });
  it("keeps reference TVD out of geometry", () => {
    const a = project(),
      b = structuredClone(a);
    b.sections[0].referenceTvdM = 123;
    expect(generateProject(a).points).toEqual(generateProject(b).points);
  });
  it("is vertical without trajectory", () => {
    const g = generateProject(project());
    expect(g.totalHorizontalM).toBe(0);
    expect(g.totalVisualTvdM).toBe(2200);
  });
  it("builds from KOP to horizontal at EOC", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 1800, endCurveMdM: 2000 };
    expect(pointAtMd(p, 1800).inclinationDeg).toBe(0);
    expect(pointAtMd(p, 2000).inclinationDeg).toBe(90);
    expect(pointAtMd(p, 2200).tvdM).toBeCloseTo(pointAtMd(p, 2000).tvdM);
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
  it("rejects schema v2", () =>
    expect(validateProject({ ...project(), version: 2 } as never)).toEqual([
      "Unsupported FluidLab project schema.",
    ]));
});
