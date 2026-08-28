import { pointAtMd, sectionTopMd, type WellProject } from "./engineering";

export type CameraMode = "follow" | "overview";

export function totalMd(project: WellProject) {
  return project.sections.at(-1)?.endMdM ?? 0;
}

export function clampMd(project: WellProject, mdM: number) {
  const maximum = totalMd(project);
  if (!Number.isFinite(mdM)) return 0;
  return Math.min(maximum, Math.max(0, mdM));
}

export function sectionMidpointMd(project: WellProject, sectionId: string) {
  const index = project.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return null;
  return (sectionTopMd(project, index) + project.sections[index].endMdM) / 2;
}

export function cameraPointAtMd(project: WellProject, mdM: number) {
  const position = pointAtMd(project, clampMd(project, mdM));
  return { x: position.horizontalM, y: -position.verticalM, z: 0 };
}

export function cameraTangentAtMd(project: WellProject, mdM: number) {
  const maximum = totalMd(project);
  if (maximum <= 0) return { x: 0, y: -1, z: 0 };
  const sample = Math.max(maximum / 1000, 0.25);
  const before = cameraPointAtMd(project, Math.max(0, mdM - sample));
  const after = cameraPointAtMd(project, Math.min(maximum, mdM + sample));
  const x = after.x - before.x, y = after.y - before.y;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, z: 0 };
}

export const metresToDisplayDepth = (mdM: number, imperial: boolean) =>
  imperial ? mdM * 3.280839895 : mdM;

export const displayDepthToMetres = (depth: number, imperial: boolean) =>
  imperial ? depth / 3.280839895 : depth;
