import {describe,expect,it} from "vitest";
import {addIntermediateSection,createProject,deleteIntermediateSection,generateProject,validateProject} from "./engineering";
describe("MD/TVD conceptual well model",()=>{
  it("creates schema v2 sections",()=>{const p=createProject();expect(p.version).toBe(2);expect(p.sections.map(s=>s.category)).toEqual(["surface","main"]);expect(validateProject(p)).toEqual([])});
  it("renders a vertical well",()=>{const p=createProject();p.sections[1].endTvdM=2000;const g=generateProject(p);expect(g.totalHorizontalM).toBeCloseTo(0);expect(g.points.at(-1)?.tvdM).toBe(2000)});
  it("derives displacement",()=>expect(generateProject(createProject()).totalHorizontalM).toBeGreaterThan(0));
  it("passes through endpoints",()=>{const p=createProject();addIntermediateSection(p);const g=generateProject(p);for(const s of p.sections){const e=g.sections.find(x=>x.sectionId===s.id)?.points.at(-1);expect(e?.mdM).toBeCloseTo(s.endMdM);expect(e?.tvdM).toBeCloseTo(s.endTvdM)}});
  it("stays finite and monotonic",()=>{const g=generateProject(createProject());expect(g.points.every(p=>Number.isFinite(p.horizontalM)&&Number.isFinite(p.tvdM))).toBe(true);expect(g.points.every((p,i)=>!i||p.horizontalM>=g.points[i-1].horizontalM)).toBe(true)});
  it("adds and removes intermediates",()=>{const p=createProject(),id=addIntermediateSection(p);expect(p.sections.map(s=>s.category)).toEqual(["surface","intermediate","main"]);expect(deleteIntermediateSection(p,id)).toBe(true)});
  it("calculates capacity by MD interval",()=>{const p=createProject();p.sections[0].diameterMm=200;p.sections[1].diameterMm=100;const g=generateProject(p);expect(g.sections[0].capacityM3).toBeCloseTo(Math.PI*.2**2/4*500);expect(g.sections[1].capacityM3).toBeCloseTo(Math.PI*.1**2/4*1500)});
  it("rejects invalid endpoints and v1",()=>{const p=createProject();p.sections[1].endTvdM=2100;expect(validateProject(p).join()).toMatch(/TVD increase/);expect(validateProject({...p,version:1} as never)).toEqual(["Unsupported FluidLab project schema."])});
});
