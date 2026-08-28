import { describe, expect, it } from "vitest";
import {
  confirmSection,
  applySectionEdit,
  createProject,
  emptyDraft,
  editSectionErrors,
  generateProject,
  pointAtMd,
  trajectoryErrors,
  truncateFrom,
  validateProject,
} from "./engineering";
import { cameraPointAtMd, cameraTangentAtMd, clampMd, displayDepthToMetres, metresToDisplayDepth, sectionMidpointMd } from "./camera";
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
  it("edits a shared boundary without changing section identity", () => {
    const p = project(), ids = p.sections.map((section) => section.id),
      before = generateProject(p).sections.map((section) => section.capacityM3);
    const result = applySectionEdit(p, 0, {
      name: "Surface revised",
      endMdM: 1100,
      diameterMm: 300,
      color: "#ef7d65",
    });
    expect(result.errors).toEqual([]);
    expect(p.sections.map((section) => section.id)).toEqual(ids);
    expect(p.sections[0].endMdM).toBe(1100);
    expect(generateProject(p).sections.map((section) => section.startMdM)).toEqual([0, 1100]);
    const after = generateProject(p).sections.map((section) => section.capacityM3);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });
  it("edits a middle section between fixed neighbors", () => {
    const p = project();
    confirmSection(p, { name: "Tail", endMdM: 3000, diameterMm: 159, color: "#8a73e8" });
    expect(applySectionEdit(p, 1, {
      name: "Middle", endMdM: 2100, diameterMm: 200, color: "#f2b84b",
    }).errors).toEqual([]);
    expect(p.sections.map((section) => section.endMdM)).toEqual([1000, 2100, 3000]);
  });
  it("keeps edited MD between neighboring boundaries", () => {
    const p = project(), base = { name: "", diameterMm: 200, color: "#35dfbd" };
    expect(editSectionErrors(p, 0, { ...base, endMdM: 0 }).join()).toMatch(/greater/);
    expect(editSectionErrors(p, 0, { ...base, endMdM: 2200 }).join()).toMatch(/less/);
    expect(editSectionErrors(p, 1, { ...base, endMdM: 1000 }).join()).toMatch(/greater/);
  });
  it("blocks edits that place the applied EOC beyond total MD", () => {
    const p = project();
    p.trajectory = { enabled: true, kopMdM: 1800, endCurveMdM: 2100 };
    expect(editSectionErrors(p, 1, {
      name: "Lateral", endMdM: 2000, diameterMm: 216, color: "#43aee8",
    }).join()).toMatch(/End of Curve/);
  });
  it("rejects older schemas", () =>
    expect(validateProject({ ...project(), version: 3 } as never)).toEqual([
      "Unsupported FluidLab project schema.",
    ]));
  it("clamps camera depth and converts display units", () => {
    const p = project();
    expect(clampMd(p, -10)).toBe(0);
    expect(clampMd(p, 5000)).toBe(2200);
    expect(displayDepthToMetres(metresToDisplayDepth(1234, true), true)).toBeCloseTo(1234);
  });
  it("focuses section midpoints and calculates stable camera geometry", () => {
    const p = project();
    expect(sectionMidpointMd(p, p.sections[1].id)).toBe(1600);
    expect(cameraPointAtMd(p, 100).y).toBe(-100);
    expect(cameraTangentAtMd(p, 100)).toEqual({ x: 0, y: -1, z: 0 });
  });
  it("handles an empty camera path", () => {
    const p = createProject("metric");
    expect(clampMd(p, 10)).toBe(0);
    expect(sectionMidpointMd(p, "missing")).toBeNull();
    expect(cameraTangentAtMd(p, 0)).toEqual({ x: 0, y: -1, z: 0 });
  });
});
