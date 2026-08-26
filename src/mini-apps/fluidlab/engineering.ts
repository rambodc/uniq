export type UnitSystem = "metric" | "imperial";
export interface WellSection {
  id: string;
  name: string;
  endMdM: number;
  diameterMm: number;
  color: string;
  visible: boolean;
}
export interface WellTrajectory {
  enabled: boolean;
  kopMdM: number | null;
  endCurveMdM: number | null;
}
export interface WellProject {
  version: 1;
  name: string;
  unitSystem: UnitSystem | null;
  sections: WellSection[];
  trajectory: WellTrajectory;
}
export interface SectionDraft {
  name: string;
  endMdM: number | null;
  diameterMm: number | null;
  color: string;
}
export interface ProfilePoint {
  mdM: number;
  verticalM: number;
  horizontalM: number;
  inclinationDeg: number;
  sectionId: string;
}
export interface DerivedSection {
  sectionId: string;
  startMdM: number;
  endMdM: number;
  startVerticalM: number;
  endVerticalM: number;
  horizontalDisplacementM: number;
  capacityM3: number;
  points: ProfilePoint[];
}
export interface GeneratedProject {
  points: ProfilePoint[];
  sections: DerivedSection[];
  errors: string[];
  totalCapacityM3: number;
  totalHorizontalM: number;
  totalVerticalM: number;
}
export const sectionColors = ["#35dfbd", "#43aee8", "#8a73e8", "#f2b84b", "#ef7d65"];
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
export const emptyDraft = (): SectionDraft => ({
  name: "",
  endMdM: null,
  diameterMm: null,
  color: sectionColors[0],
});
export function createProject(unitSystem: UnitSystem | null = null): WellProject {
  return {
    version: 1,
    name: "New conceptual well",
    unitSystem,
    sections: [],
    trajectory: { enabled: false, kopMdM: null, endCurveMdM: null },
  };
}
export function sectionTopMd(project: WellProject, index: number) {
  return index ? project.sections[index - 1].endMdM : 0;
}
export function draftErrors(project: WellProject, draft: SectionDraft) {
  const errors: string[] = [],
    top = project.sections.at(-1)?.endMdM ?? 0;
  if (
    draft.endMdM == null ||
    !Number.isFinite(draft.endMdM) ||
    draft.endMdM <= top
  )
    errors.push(`Bottom MD must be greater than ${top}.`);
  if (
    draft.diameterMm == null ||
    !Number.isFinite(draft.diameterMm) ||
    draft.diameterMm <= 0
  )
    errors.push("Enter a positive bit size.");
  if (!/^#[0-9a-f]{6}$/i.test(draft.color))
    errors.push("Choose a valid section color.");
  if (draft.name.length > 80)
    errors.push("Section name must be 80 characters or fewer.");
  return errors;
}
export function confirmSection(project: WellProject, draft: SectionDraft) {
  const errors = draftErrors(project, draft);
  if (errors.length) return { section: null, errors };
  const section: WellSection = {
    id: uid(),
    name: draft.name.trim(),
    endMdM: draft.endMdM!,
    diameterMm: draft.diameterMm!,
    color: draft.color,
    visible: true,
  };
  project.sections.push(section);
  return { section, errors: [] };
}
export function editSectionErrors(
  project: WellProject,
  index: number,
  draft: SectionDraft,
) {
  const section = project.sections[index];
  if (!section) return ["Choose a confirmed section."];
  const errors: string[] = [],
    lower = sectionTopMd(project, index),
    upper = project.sections[index + 1]?.endMdM;
  if (
    draft.endMdM == null ||
    !Number.isFinite(draft.endMdM) ||
    draft.endMdM <= lower
  )
    errors.push(`Bottom MD must be greater than ${lower}.`);
  if (upper != null && draft.endMdM != null && draft.endMdM >= upper)
    errors.push(`Bottom MD must be less than ${upper}.`);
  if (
    draft.diameterMm == null ||
    !Number.isFinite(draft.diameterMm) ||
    draft.diameterMm <= 0
  )
    errors.push("Enter a positive bit size.");
  if (!/^#[0-9a-f]{6}$/i.test(draft.color))
    errors.push("Choose a valid section color.");
  if (draft.name.length > 80)
    errors.push("Section name must be 80 characters or fewer.");
  if (
    index === project.sections.length - 1 &&
    project.trajectory.enabled &&
    draft.endMdM != null &&
    project.trajectory.endCurveMdM != null &&
    draft.endMdM < project.trajectory.endCurveMdM
  )
    errors.push(
      "Bottom MD cannot be shallower than the applied End of Curve. Adjust or disable the trajectory first.",
    );
  return errors;
}
export function applySectionEdit(
  project: WellProject,
  index: number,
  draft: SectionDraft,
) {
  const errors = editSectionErrors(project, index, draft);
  if (errors.length) return { section: null, errors };
  const section = project.sections[index];
  section.name = draft.name.trim();
  section.endMdM = draft.endMdM!;
  section.diameterMm = draft.diameterMm!;
  section.color = draft.color;
  return { section, errors: [] };
}
export function truncateFrom(project: WellProject, index: number) {
  if (index < 0 || index >= project.sections.length) return null;
  const removed = project.sections.slice(index),
    first = removed[0];
  project.sections = project.sections.slice(0, index);
  const total = project.sections.at(-1)?.endMdM ?? 0,
    trajectoryCleared =
      project.trajectory.enabled &&
      Number(project.trajectory.endCurveMdM) > total;
  if (trajectoryCleared)
    project.trajectory = { enabled: false, kopMdM: null, endCurveMdM: null };
  return {
    draft: {
      name: first.name,
      endMdM: first.endMdM,
      diameterMm: first.diameterMm,
      color: first.color,
    },
    removedCount: removed.length,
    trajectoryCleared,
  };
}
export function trajectoryErrors(
  project: WellProject,
  trajectory = project.trajectory,
) {
  if (!trajectory.enabled) return [];
  const total = project.sections.at(-1)?.endMdM ?? 0,
    kop = trajectory.kopMdM,
    eoc = trajectory.endCurveMdM,
    errors: string[] = [];
  if (kop == null || !Number.isFinite(kop) || kop < 0)
    errors.push("Enter a KOP at or below the surface.");
  if (eoc == null || !Number.isFinite(eoc))
    errors.push("Enter an End of Curve MD.");
  if (kop != null && eoc != null && eoc <= kop)
    errors.push("End of Curve must be deeper than KOP.");
  if (eoc != null && eoc > total)
    errors.push("End of Curve cannot exceed total MD.");
  return errors;
}
export function validateProject(project: WellProject) {
  if (
    !project ||
    project.version !== 1 ||
    !Array.isArray(project.sections) ||
    !project.trajectory
  )
    return ["Unsupported FluidLab project schema."];
  const errors: string[] = [];
  if (
    typeof project.name !== "string" ||
    !project.name.trim() ||
    project.name.length > 100
  )
    errors.push("Enter a valid project name.");
  if (project.unitSystem !== "metric" && project.unitSystem !== "imperial")
    errors.push("Choose project units.");
  if (project.sections.length < 1 || project.sections.length > 50)
    errors.push("Confirm between 1 and 50 sections.");
  const ids = new Set<string>();
  let prior = 0;
  project.sections.forEach((section, index) => {
    if (!section || typeof section.id !== "string" || ids.has(section.id))
      errors.push("Section IDs must be unique.");
    else ids.add(section.id);
    if (typeof section?.name !== "string" || section.name.length > 80)
      errors.push(`Section ${index + 1} has an invalid name.`);
    if (!Number.isFinite(section?.endMdM) || section.endMdM <= prior)
      errors.push(
        `Section ${index + 1}: Bottom MD must be greater than ${prior}.`,
      );
    if (!/^#[0-9a-f]{6}$/i.test(section?.color))
      errors.push(`Section ${index + 1}: choose a valid color.`);
    if (!Number.isFinite(section?.diameterMm) || section.diameterMm <= 0)
      errors.push(`Section ${index + 1}: enter a positive bit size.`);
    if (Number.isFinite(section?.endMdM)) prior = section.endMdM;
  });
  return [...new Set([...errors, ...trajectoryErrors(project)])];
}
export function pointAtMd(
  project: WellProject,
  mdM: number,
  sectionId = "",
): ProfilePoint {
  const t = project.trajectory;
  if (
    !t.enabled ||
    t.kopMdM == null ||
    t.endCurveMdM == null ||
    mdM <= t.kopMdM
  )
    return { mdM, verticalM: mdM, horizontalM: 0, inclinationDeg: 0, sectionId };
  const length = t.endCurveMdM - t.kopMdM,
    radius = (2 * length) / Math.PI;
  if (mdM < t.endCurveMdM) {
    const theta = (mdM - t.kopMdM) / radius;
    return {
      mdM,
      verticalM: t.kopMdM + radius * Math.sin(theta),
      horizontalM: radius * (1 - Math.cos(theta)),
      inclinationDeg: (theta * 180) / Math.PI,
      sectionId,
    };
  }
  return {
    mdM,
    verticalM: t.kopMdM + radius,
    horizontalM: radius + (mdM - t.endCurveMdM),
    inclinationDeg: 90,
    sectionId,
  };
}
export function generateProject(project: WellProject): GeneratedProject {
  const errors = validateProject(project);
  if (errors.length)
    return {
      points: [],
      sections: [],
      errors,
      totalCapacityM3: 0,
      totalHorizontalM: 0,
      totalVerticalM: 0,
    };
  const points: ProfilePoint[] = [],
    sections: DerivedSection[] = [];
  let start = 0,
    totalCapacityM3 = 0;
  project.sections.forEach((section) => {
    const boundaries = [start, section.endMdM],
      t = project.trajectory;
    if (t.enabled) {
      if (t.kopMdM! > start && t.kopMdM! < section.endMdM)
        boundaries.push(t.kopMdM!);
      if (t.endCurveMdM! > start && t.endCurveMdM! < section.endMdM)
        boundaries.push(t.endCurveMdM!);
    }
    boundaries.sort((a, b) => a - b);
    const mdValues: number[] = [];
    for (let part = 0; part < boundaries.length - 1; part++) {
      const a = boundaries[part],
        b = boundaries[part + 1],
        samples = Math.max(2, Math.ceil((b - a) / 25));
      for (let sample = 0; sample <= samples; sample++) {
        const md = a + ((b - a) * sample) / samples;
        if (!mdValues.length || Math.abs(md - mdValues.at(-1)!) > 1e-8)
          mdValues.push(md);
      }
    }
    const sectionPoints = mdValues.map((md) =>
        pointAtMd(project, md, section.id),
      ),
      first = sectionPoints[0],
      last = sectionPoints.at(-1)!,
      capacityM3 =
        ((Math.PI * (section.diameterMm / 1000) ** 2) / 4) *
        (section.endMdM - start);
    totalCapacityM3 += capacityM3;
    sections.push({
      sectionId: section.id,
      startMdM: start,
      endMdM: section.endMdM,
      startVerticalM: first.verticalM,
      endVerticalM: last.verticalM,
      horizontalDisplacementM: last.horizontalM - first.horizontalM,
      capacityM3,
      points: sectionPoints,
    });
    sectionPoints.forEach((point, index) => {
      if (!points.length || index) points.push(point);
    });
    start = section.endMdM;
  });
  const last = points.at(-1)!;
  return {
    points,
    sections,
    errors: [],
    totalCapacityM3,
    totalHorizontalM: last.horizontalM,
    totalVerticalM: last.verticalM,
  };
}
export function containingSection(project: WellProject, md: number | null) {
  if (md == null) return null;
  return (
    project.sections.find(
      (section, index) =>
        md >= sectionTopMd(project, index) && md <= section.endMdM,
    ) ?? null
  );
}
export const cubicMetresToBbl = (value: number) => value * 6.28981077;
